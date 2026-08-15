/*
 * track_describer.c — SpotifAI nano track describer engine.
 *
 * A minimal, focused C engine that loads an exported MHSI INT4 .bin at
 * runtime and generates a track blurb from a metadata prompt. Reuses
 * Project-K's INT4 GLA forward path (project_k.c mhsi_load / gla_step /
 * mhs_block_gla_forward_i4 / sample_greedy) but drops the nano intent
 * classifier and kernel diagnostics — this is a pure char-level LM.
 *
 * Compile-time dims MUST match the exported binary (train --d --dh0 --dh1)
 * and I4_GS must match the export's group_sz.
 *
 * Usage:
 *   track_describer <model.bin> <vocab.tsv> <n_tokens> < prompt
 *   reads a prompt line from stdin, prints the generated continuation.
 *   track_describer --tags < prompt    (no model needed)
 *   emits deterministic mood/energy tags from metadata keywords — the
 *   offline "mood/energy" tag layer (John's next-ideas #4), local + free.
 *
 * Hard rule (John): this generates BLURBS only. It never touches the
 * recommendation endpoints — ranking stays co-occurrence.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

/* ── Compile-time dims (must match training + export) ────────────────── */
#ifndef MHS_D
#define MHS_D 96
#endif
#ifndef MHS_DH0
#define MHS_DH0 32
#endif
#ifndef MHS_DH1
#define MHS_DH1 32
#endif
#ifndef I4_GS
#define I4_GS 96
#endif
#define MHS_MLP (4 * MHS_D)
#define MAX_LAYERS 12
#define MAX_BLOCK_SIZE 512
#define MAX_VOCAB 5000

/* ── INT4 packing helpers (from project_k.c) ─────────────────────────── */
#define I4_PACKED_PER_ROW(c) (((c) + I4_GS - 1) / I4_GS * (I4_GS / 2))
#define I4_GROUPS_PER_ROW(c) (((c) + I4_GS - 1) / I4_GS)
#define I4_ROW_STRIDE(c)     (I4_PACKED_PER_ROW(c) + I4_GROUPS_PER_ROW(c) * 4)

static inline int8_t unpack4_lo(uint8_t b) { int8_t v = b & 0x0F; return v > 7 ? v - 16 : v; }
static inline int8_t unpack4_hi(uint8_t b) { int8_t v = (b >> 4) & 0x0F; return v > 7 ? v - 16 : v; }

static float row_dot_i4(const uint8_t *row_q4, const float *sc, int group_sz,
                        const float *x, int cols) {
    float acc = 0.0f;
    int half_gs = group_sz >> 1;
    int n_full = cols / group_sz;
    int tail = cols % group_sz;
    const uint8_t *pb = row_q4;
    const float *px = x;
    for (int g = 0; g < n_full; g++) {
        float gs = sc[g], gacc = 0.0f;
        for (int k = 0; k < half_gs; k++) {
            uint8_t byte = pb[k];
            gacc += (float)unpack4_lo(byte) * px[2 * k] + (float)unpack4_hi(byte) * px[2 * k + 1];
        }
        acc += gacc * gs; pb += half_gs; px += group_sz;
    }
    if (tail > 0) {
        float gs = sc[n_full], gacc = 0.0f;
        int tb = tail >> 1;
        for (int k = 0; k < tb; k++) {
            uint8_t byte = pb[k];
            gacc += (float)unpack4_lo(byte) * px[2 * k] + (float)unpack4_hi(byte) * px[2 * k + 1];
        }
        if (tail & 1) gacc += (float)unpack4_lo(pb[tb]) * px[tail - 1];
        acc += gacc * gs;
    }
    return acc;
}

/* ── Basic math ops ───────────────────────────────────────────────────── */
static inline float sigmoid(float x) { return 1.0f / (1.0f + expf(-x)); }
static inline float gelu(float x)    { return x * (1.0f / (1.0f + expf(-1.702f * x))); }
static inline float elu1(float x)    { return x >= 0.0f ? x + 1.0f : expf(x); }

static void layer_norm_b(float *x, const float *w, const float *b, int d) {
    float mean = 0; for (int i = 0; i < d; i++) mean += x[i]; mean /= (float)d;
    float var = 0; for (int i = 0; i < d; i++) { float v = x[i] - mean; var += v * v; }
    float inv = 1.0f / sqrtf(var / (float)d + 1e-5f);
    for (int i = 0; i < d; i++) x[i] = (x[i] - mean) * inv * w[i] + (b ? b[i] : 0.0f);
}

static float dot_f32(const float *a, const float *b, int n) {
    float r = 0; for (int i = 0; i < n; i++) r += a[i] * b[i]; return r;
}

/* ── GLA per-token recurrence (C=1, from project_k.c) ────────────────── */
static void gla_step(float *out, float *S, float *z,
                     const float *q, const float *k, const float *v,
                     float f, int dh) {
    float inner = dot_f32(q, k, dh);
    float q2[128]; float den = inner;
    for (int i = 0; i < dh; i++) { q2[i] = q[i] * f; den += q2[i] * z[i]; }
    float num[128];
    for (int i = 0; i < dh; i++) num[i] = inner * v[i];
    for (int i = 0; i < dh; i++)
        for (int j = 0; j < dh; j++) num[j] += q2[i] * S[i * dh + j];
    float inv = 1.0f / fmaxf(den, 1e-2f);
    for (int i = 0; i < dh; i++) out[i] = num[i] * inv;
    for (int i = 0; i < dh; i++) {
        for (int j = 0; j < dh; j++) S[i * dh + j] = f * S[i * dh + j] + k[i] * v[j];
        z[i] = f * z[i] + k[i];
    }
}

/* ── Model state ──────────────────────────────────────────────────────── */
typedef struct {
    const uint8_t *fast_qkv, *fast_proj, *med_qkv, *med_proj;
    const float *ln1, *ln2;
    const uint8_t *mlp_fc, *mlp_pr;
    const float *fast_fgate, *med_fgate;
    const float *fast_qkv_bias, *fast_proj_bias;
    float fast_fgate_bias;
    const float *med_qkv_bias, *med_proj_bias;
    float med_fgate_bias;
    const float *ln1_bias, *ln2_bias;
    const float *mlp_fc_bias, *mlp_proj_bias;
} MhsBlock;

static uint32_t g_vocab, g_d, g_n_layers, g_dh0, g_dh1;
static int g_block_size = 0;
static MhsBlock g_blocks[MAX_LAYERS];
static const uint8_t *g_emb;
static const uint8_t *g_head;
static const float *g_ln_f = NULL;
static const float *g_ln_f_bias = NULL;
static float g_pos_buf[MAX_BLOCK_SIZE * MHS_D];
static float g_Sf[MAX_LAYERS][MHS_DH0 * MHS_DH0];
static float g_zf[MAX_LAYERS][MHS_DH0];
static float g_Sm[MAX_LAYERS][MHS_DH1 * MHS_DH1];
static float g_zm[MAX_LAYERS][MHS_DH1];

#define MHSI_MAGIC 0x4953484Du

static int mhsi_load(const uint8_t *bin, size_t len) {
    if (len < 32) return 0;
    uint32_t magic, gs, bs;
    memcpy(&magic, bin, 4);
    if (magic != MHSI_MAGIC) return 0;
    memcpy(&g_vocab, bin + 4, 4); memcpy(&g_d, bin + 8, 4);
    memcpy(&g_n_layers, bin + 12, 4); memcpy(&g_dh0, bin + 16, 4);
    memcpy(&g_dh1, bin + 20, 4); memcpy(&gs, bin + 24, 4); memcpy(&bs, bin + 28, 4);
    g_block_size = (int)bs;
    if (g_n_layers > MAX_LAYERS) return 0;
    if ((int)g_d != MHS_D || (int)g_dh0 != MHS_DH0 || (int)g_dh1 != MHS_DH1) {
        fprintf(stderr, "mhsi_load: binary d=%u dh0=%u dh1=%u != compile-time %d %d %d\n",
                g_d, g_dh0, g_dh1, MHS_D, MHS_DH0, MHS_DH1);
        return 0;
    }
    if ((int)gs != I4_GS) {
        fprintf(stderr, "mhsi_load: group_sz=%u != I4_GS=%d\n", gs, I4_GS);
        return 0;
    }
    uint32_t mlp = 4 * g_d;
    size_t off = 32;
    g_emb = bin + off;
    { int ppr = I4_PACKED_PER_ROW(g_d), gpr = I4_GROUPS_PER_ROW(g_d);
      off += (size_t)g_vocab * ppr + (size_t)g_vocab * gpr * 4; }
    for (uint32_t i = 0; i < g_n_layers; i++) {
        MhsBlock *blk = &g_blocks[i];
        memset(blk, 0, sizeof(*blk));
        blk->fast_qkv = bin + off;
        { int ppr = I4_PACKED_PER_ROW(g_d), gpr = I4_GROUPS_PER_ROW(g_d);
          off += (size_t)(3 * g_dh0) * ppr + (size_t)(3 * g_dh0) * gpr * 4; }
        blk->fast_qkv_bias = (const float *)(bin + off); off += 3 * g_dh0 * 4;
        blk->fast_fgate = (const float *)(bin + off); off += g_d * 4;
        memcpy(&blk->fast_fgate_bias, bin + off, 4); off += 4;
        blk->fast_proj = bin + off;
        { int ppr = I4_PACKED_PER_ROW(g_dh0), gpr = I4_GROUPS_PER_ROW(g_dh0);
          off += (size_t)g_d * ppr + (size_t)g_d * gpr * 4; }
        blk->fast_proj_bias = (const float *)(bin + off); off += g_d * 4;
        blk->med_qkv = bin + off;
        { int ppr = I4_PACKED_PER_ROW(g_d), gpr = I4_GROUPS_PER_ROW(g_d);
          off += (size_t)(3 * g_dh1) * ppr + (size_t)(3 * g_dh1) * gpr * 4; }
        blk->med_qkv_bias = (const float *)(bin + off); off += 3 * g_dh1 * 4;
        blk->med_fgate = (const float *)(bin + off); off += g_d * 4;
        memcpy(&blk->med_fgate_bias, bin + off, 4); off += 4;
        blk->med_proj = bin + off;
        { int ppr = I4_PACKED_PER_ROW(g_dh1), gpr = I4_GROUPS_PER_ROW(g_dh1);
          off += (size_t)g_d * ppr + (size_t)g_d * gpr * 4; }
        blk->med_proj_bias = (const float *)(bin + off); off += g_d * 4;
        blk->ln1 = (const float *)(bin + off); off += g_d * 4;
        blk->ln1_bias = (const float *)(bin + off); off += g_d * 4;
        blk->ln2 = (const float *)(bin + off); off += g_d * 4;
        blk->ln2_bias = (const float *)(bin + off); off += g_d * 4;
        blk->mlp_fc = bin + off;
        { int ppr = I4_PACKED_PER_ROW(g_d), gpr = I4_GROUPS_PER_ROW(g_d);
          off += (size_t)mlp * ppr + (size_t)mlp * gpr * 4; }
        blk->mlp_fc_bias = (const float *)(bin + off); off += mlp * 4;
        blk->mlp_pr = bin + off;
        { int ppr = I4_PACKED_PER_ROW(mlp), gpr = I4_GROUPS_PER_ROW(mlp);
          off += (size_t)g_d * ppr + (size_t)g_d * gpr * 4; }
        blk->mlp_proj_bias = (const float *)(bin + off); off += g_d * 4;
    }
    g_ln_f = (const float *)(bin + off); off += g_d * 4;
    g_ln_f_bias = (const float *)(bin + off); off += g_d * 4;
    { int ppr = I4_PACKED_PER_ROW(g_d), gpr = I4_GROUPS_PER_ROW(g_d);
      for (uint32_t r = 0; r < bs; r++) {
          const uint8_t *pw = bin + off + (size_t)r * ppr;
          const float *ps = (const float *)(bin + off + (size_t)bs * ppr + (size_t)r * gpr * 4);
          float *dst = g_pos_buf + (size_t)r * g_d;
          for (int j = 0; j < (int)g_d; j += I4_GS) {
              int g = j / I4_GS; float sc = ps[g];
              int lim = j + I4_GS > (int)g_d ? (int)g_d : j + I4_GS;
              for (int k = j; k < lim; k += 2) {
                  uint8_t byte = pw[k / 2];
                  dst[k] = (float)unpack4_lo(byte) * sc;
                  if (k + 1 < lim) dst[k + 1] = (float)unpack4_hi(byte) * sc;
              }
          }
      }
      off += (size_t)bs * ppr + (size_t)bs * gpr * 4; }
    g_head = g_emb; /* weight-tied */
    return 1;
}

/* ── Forward ──────────────────────────────────────────────────────────── */
static void embed_token(int tok_id, float *x) {
    int d = (int)g_d, V = (int)g_vocab;
    int ppr = I4_PACKED_PER_ROW(d), gpr = I4_GROUPS_PER_ROW(d);
    const uint8_t *pw = g_emb + (size_t)tok_id * ppr;
    const float *ps = (const float *)(g_emb + (size_t)V * ppr + (size_t)tok_id * gpr * 4);
    for (int j = 0; j < d; j += I4_GS) {
        int g = j / I4_GS; float gs = ps[g];
        int lim = j + I4_GS > d ? d : j + I4_GS;
        for (int k = j; k < lim; k += 2) {
            uint8_t byte = pw[k / 2];
            x[k] = (float)unpack4_lo(byte) * gs;
            if (k + 1 < lim) x[k + 1] = (float)unpack4_hi(byte) * gs;
        }
    }
}

/* INT4 matvec: y[r] = w[r,:]·x + bias[r].
 * Layout (from export_int4_bin.py pack_matrix_int4): all rows' packed bytes
 * first (rows*ppr), THEN all rows' scales (rows*gpr*4). Row r's packed data
 * is at w + r*ppr; its scales at w + rows*ppr + r*gpr*4. */
static void mv_i4(const uint8_t *w, const float *bias,
                  const float *x, float *y, int rows, int cols) {
    int ppr = I4_PACKED_PER_ROW(cols), gpr = I4_GROUPS_PER_ROW(cols);
    for (int r = 0; r < rows; r++) {
        const uint8_t *pw = w + (size_t)r * ppr;
        const float *ps = (const float *)(w + (size_t)rows * ppr + (size_t)r * gpr * 4);
        float acc = bias ? bias[r] : 0.0f;
        for (int g = 0; g < gpr; g++) {
            float gs = ps[g];
            int lim = (g + 1) * I4_GS > cols ? cols : (g + 1) * I4_GS;
            for (int k = g * I4_GS; k < lim; k += 2) {
                uint8_t byte = pw[k / 2];
                acc += (float)unpack4_lo(byte) * x[k] * gs;
                if (k + 1 < lim) acc += (float)unpack4_hi(byte) * x[k + 1] * gs;
            }
        }
        y[r] = acc;
    }
}

/* Accumulate variant (for two projections sharing one output buffer). */
static void mv_i4_acc(const uint8_t *w, const float *bias,
                      const float *x, float *y, int rows, int cols) {
    int ppr = I4_PACKED_PER_ROW(cols), gpr = I4_GROUPS_PER_ROW(cols);
    for (int r = 0; r < rows; r++) {
        const uint8_t *pw = w + (size_t)r * ppr;
        const float *ps = (const float *)(w + (size_t)rows * ppr + (size_t)r * gpr * 4);
        float acc = bias ? bias[r] : 0.0f;
        for (int g = 0; g < gpr; g++) {
            float gs = ps[g];
            int lim = (g + 1) * I4_GS > cols ? cols : (g + 1) * I4_GS;
            for (int k = g * I4_GS; k < lim; k += 2) {
                uint8_t byte = pw[k / 2];
                acc += (float)unpack4_lo(byte) * x[k] * gs;
                if (k + 1 < lim) acc += (float)unpack4_hi(byte) * x[k + 1] * gs;
            }
        }
        y[r] += acc;
    }
}

static void block_forward(float *x, int layer, const MhsBlock *blk) {
    float tmp[MHS_D], qkv_f[3 * MHS_DH0], qkv_m[3 * MHS_DH1];
    float attn[MHS_D], fc[MHS_MLP], mo[MHS_D];
    float out_f[MHS_DH0], out_m[MHS_DH1];
    int d = (int)g_d;

    memcpy(tmp, x, d * sizeof(float));
    layer_norm_b(tmp, blk->ln1, blk->ln1_bias, d);

    mv_i4(blk->fast_qkv, blk->fast_qkv_bias, tmp, qkv_f, 3 * MHS_DH0, d);
    for (int i = 0; i < 2 * MHS_DH0; i++) qkv_f[i] = elu1(qkv_f[i]);
    float ff = sigmoid(dot_f32(blk->fast_fgate, tmp, d) + blk->fast_fgate_bias);

    mv_i4(blk->med_qkv, blk->med_qkv_bias, tmp, qkv_m, 3 * MHS_DH1, d);
    for (int i = 0; i < 2 * MHS_DH1; i++) qkv_m[i] = elu1(qkv_m[i]);
    float fm = sigmoid(dot_f32(blk->med_fgate, tmp, d) + blk->med_fgate_bias);

    gla_step(out_f, g_Sf[layer], g_zf[layer], qkv_f, qkv_f + MHS_DH0, qkv_f + 2 * MHS_DH0, ff, MHS_DH0);
    gla_step(out_m, g_Sm[layer], g_zm[layer], qkv_m, qkv_m + MHS_DH1, qkv_m + 2 * MHS_DH1, fm, MHS_DH1);

    memset(attn, 0, d * sizeof(float));
    mv_i4(blk->fast_proj, blk->fast_proj_bias, out_f, attn, d, MHS_DH0);
    mv_i4_acc(blk->med_proj, blk->med_proj_bias, out_m, attn, d, MHS_DH1);
    for (int i = 0; i < d; i++) x[i] += attn[i];

    memcpy(tmp, x, d * sizeof(float));
    layer_norm_b(tmp, blk->ln2, blk->ln2_bias, d);
    mv_i4(blk->mlp_fc, blk->mlp_fc_bias, tmp, fc, MHS_MLP, d);
    for (int i = 0; i < MHS_MLP; i++) fc[i] = gelu(fc[i]);
    memset(mo, 0, d * sizeof(float));
    mv_i4(blk->mlp_pr, blk->mlp_proj_bias, fc, mo, d, MHS_MLP);
    for (int i = 0; i < d; i++) x[i] += mo[i];
}

/* ── Sampling (top-k + nucleus + repetition penalty, from Project-K) ─────
 * Plain greedy on a tiny overfit GLA collapses into repetition loops.
 * Project-K's proven config (temp 0.85, top-k 50, top-p 0.92, rep-pen 1.15)
 * keeps blurbs varied while staying on-distribution.
 */
#define GEN_TEMP      0.85f
#define GEN_TOPK      50
#define GEN_TOPP      0.92f
#define GEN_REP_PEN   1.15f
#define GEN_REP_WIN   64

static int g_recent_toks[GEN_REP_WIN];
static int g_recent_n = 0;

static int sample_token(const float *x) {
    int d = (int)g_d, V = (int)g_vocab;
    int ppr = I4_PACKED_PER_ROW(d), gpr = I4_GROUPS_PER_ROW(d);
    float logits[MAX_VOCAB];
    for (int i = 0; i < V; i++) {
        const uint8_t *pw = g_head + (size_t)i * ppr;
        const float *ps = (const float *)(g_head + (size_t)V * ppr + (size_t)i * gpr * 4);
        logits[i] = row_dot_i4(pw, ps, I4_GS, x, d);
    }
    /* Repetition penalty: divide logit for tokens seen recently. */
    for (int r = 0; r < g_recent_n; r++) {
        int t = g_recent_toks[r];
        if (t >= 0 && t < V)
            logits[t] = logits[t] > 0 ? logits[t] / GEN_REP_PEN : logits[t] * GEN_REP_PEN;
    }
    /* Top-k: keep the k largest logits. */
    int k = GEN_TOPK < V ? GEN_TOPK : V;
    int top_idx[MAX_VOCAB]; int nfound = 0;
    for (int i = 0; i < V; i++) {
        if (nfound < k) { top_idx[nfound++] = i; }
        else {
            int min_j = 0;
            for (int j = 1; j < nfound; j++) if (logits[top_idx[j]] < logits[top_idx[min_j]]) min_j = j;
            if (logits[i] > logits[top_idx[min_j]]) top_idx[min_j] = i;
        }
    }
    /* Softmax with temperature over top-k. */
    float mx = logits[top_idx[0]];
    for (int j = 1; j < nfound; j++) if (logits[top_idx[j]] > mx) mx = logits[top_idx[j]];
    float sum = 0;
    float probs[MAX_VOCAB];
    for (int j = 0; j < nfound; j++) { probs[j] = expf((logits[top_idx[j]] - mx) / GEN_TEMP); sum += probs[j]; }
    /* Nucleus (top-p): sort desc, keep min set with cumulative prob >= top-p. */
    for (int i = 0; i < nfound - 1; i++)
        for (int j = i + 1; j < nfound; j++)
            if (probs[j] > probs[i]) {
                float tp = probs[i]; probs[i] = probs[j]; probs[j] = tp;
                int ti = top_idx[i]; top_idx[i] = top_idx[j]; top_idx[j] = ti;
            }
    float nucleus = GEN_TOPP * sum, cum = 0; int nucleus_n = nfound;
    for (int j = 0; j < nfound; j++) { cum += probs[j]; if (cum >= nucleus) { nucleus_n = j + 1; break; } }
    /* Sample from the nucleus. */
    float rnd = (float)rand() / (float)RAND_MAX * cum;
    cum = 0; int chosen = top_idx[0];
    for (int j = 0; j < nucleus_n; j++) { cum += probs[j]; if (cum >= rnd) { chosen = top_idx[j]; break; } }
    /* Record in recent window. */
    if (g_recent_n < GEN_REP_WIN) g_recent_toks[g_recent_n++] = chosen;
    else {
        memmove(g_recent_toks, g_recent_toks + 1, (GEN_REP_WIN - 1) * sizeof(int));
        g_recent_toks[GEN_REP_WIN - 1] = chosen;
    }
    return chosen;
}

/* ── Vocabulary (loaded from vocab.tsv: token_idx \t char) ───────────── */
static char g_vocab_chars[MAX_VOCAB][8];
static int g_vocab_n = 0;

static int load_vocab(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return 0;
    char line[64];
    while (g_vocab_n < MAX_VOCAB && fgets(line, sizeof(line), f)) {
        char *tab = strchr(line, '\t');
        if (!tab) continue;
        *tab = '\0';
        int idx = atoi(line);
        char *ch = tab + 1;
        int len = (int)strlen(ch);
        if (len > 0 && ch[len - 1] == '\n') ch[--len] = '\0';
        if (idx >= 0 && idx < MAX_VOCAB) {
            snprintf(g_vocab_chars[idx], sizeof(g_vocab_chars[idx]), "%s", ch);
            if (idx >= g_vocab_n) g_vocab_n = idx + 1;
        }
    }
    fclose(f);
    return g_vocab_n > 0;
}

/* ── Prompt → token ids via vocab char lookup ────────────────────────── */
static int encode_prompt(const char *text, int *toks, int max_toks) {
    int n = 0;
    int len = (int)strlen(text);
    for (int i = 0; i < len && n < max_toks; i++) {
        int found = -1;
        for (int t = 0; t < g_vocab_n; t++) {
            if (g_vocab_chars[t][0] == text[i] && g_vocab_chars[t][1] == '\0') { found = t; break; }
        }
        if (found >= 0) toks[n++] = found;
        else if (text[i] == ' ') { /* space should always be in vocab */ }
    }
    return n;
}

/* ── Offline mood/energy tags (John's next-ideas #4) ────────────────────
 * Deterministic keyword classifier over the metadata prompt (title +
 * genre + prompt fields). No model, no network, no API — stable tags the
 * desktop app can compute locally to drive "play similar by vibe" queues
 * when offline. This is deliberately simple: keyword overlap on a small
 * controlled vocabulary, matching the platform's honest-scale ethos.
 */
typedef struct { const char *word; const char *tag; } TagRule;

static const TagRule MOOD_RULES[] = {
    {"dark", "dark"}, {"menacing", "dark"}, {"horror", "dark"}, {"industrial", "dark"},
    {"harsh", "dark"}, {"brooding", "dark"}, {"noise", "dark"}, {"heavy", "dark"},
    {"dream", "dreamy"}, {"hazy", "dreamy"}, {"soft", "dreamy"}, {"lush", "dreamy"},
    {"reverb", "dreamy"}, {"weightless", "dreamy"}, {"warm", "dreamy"},
    {"melancholy", "melancholic"}, {"sad", "melancholic"}, {"lonely", "melancholic"},
    {"cold", "melancholic"}, {"rain", "melancholic"},
    {"hypnotic", "hypnotic"}, {"pulse", "hypnotic"}, {"repetitive", "hypnotic"},
    {"minimal", "hypnotic"}, {"drone", "hypnotic"},
    {"euphoric", "uplifting"}, {"bright", "uplifting"}, {"sunny", "uplifting"},
    {"celestial", "uplifting"}, {"golden", "uplifting"},
    {"tense", "tense"}, {"uneasy", "tense"}, {"fractured", "tense"}, {"glitch", "tense"},
    {"stutter", "tense"}, {"broken", "tense"},
};

static const TagRule ENERGY_RULES[] = {
    {"ambient", "low"}, {"drone", "low"}, {"slow", "low"}, {"quiet", "low"},
    {"lo-fi", "low"}, {"meditative", "low"}, {"sparse", "low"}, {"mellow", "low"},
    {"techno", "high"}, {"synthwave", "mid"}, {"house", "high"}, {"breakbeat", "high"},
    {"driving", "mid"}, {"rolling", "mid"}, {"relentless", "high"}, {"intense", "high"},
    {"drum", "high"}, {"bass", "mid"}, {"kick", "high"}, {"fast", "high"},
};

static int has_word(const char *hay, const char *needle) {
    const char *p = hay;
    size_t nlen = strlen(needle);
    while ((p = strstr(p, needle)) != NULL) {
        char before = p > hay ? p[-1] : ' ';
        char after = p[nlen];
        int b_ok = !(before >= 'a' && before <= 'z');
        int a_ok = !(after >= 'a' && after <= 'z');
        if (b_ok && a_ok) return 1;
        p += nlen;
    }
    return 0;
}

static int tag_is_new(const char **seen, int n_seen, const char *tag) {
    for (int i = 0; i < n_seen; i++) if (strcmp(seen[i], tag) == 0) return 0;
    return 1;
}

static void emit_tags(const char *prompt) {
    /* Dedupe: track which tags we've already printed. */
    const char *seen[16];
    int n_seen = 0;

    printf("mood:");
    int mood_found = 0;
    for (size_t i = 0; i < sizeof(MOOD_RULES) / sizeof(MOOD_RULES[0]) && n_seen < 16; i++) {
        if (has_word(prompt, MOOD_RULES[i].word)) {
            const char *tag = MOOD_RULES[i].tag;
            if (tag_is_new(seen, n_seen, tag)) {
                printf("%s%s", mood_found ? "," : "", tag);
                seen[n_seen++] = tag;
                mood_found = 1;
            }
        }
    }
    if (!mood_found) printf("neutral");

    printf(" energy:");
    int en_found = 0;
    for (size_t i = 0; i < sizeof(ENERGY_RULES) / sizeof(ENERGY_RULES[0]) && n_seen < 16; i++) {
        if (has_word(prompt, ENERGY_RULES[i].word)) {
            const char *tag = ENERGY_RULES[i].tag;
            if (tag_is_new(seen, n_seen, tag)) {
                printf("%s%s", en_found ? "," : "", tag);
                seen[n_seen++] = tag;
                en_found = 1;
            }
        }
    }
    if (!en_found) printf("mid");
    printf("\n");
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "--tags") == 0) {
        char buf[2048] = {0};
        if (argc >= 3) {
            snprintf(buf, sizeof(buf), "%s", argv[2]);
        } else {
            fgets(buf, sizeof(buf), stdin);
        }
        emit_tags(buf);
        return 0;
    }
    if (argc < 4) {
        fprintf(stderr, "usage: %s <model.bin> <vocab.tsv> <n_tokens> [prompt]\n", argv[0]);
        return 1;
    }
    FILE *mf = fopen(argv[1], "rb");
    if (!mf) { fprintf(stderr, "cannot open model: %s\n", argv[1]); return 1; }
    fseek(mf, 0, SEEK_END);
    long mlen = ftell(mf);
    fseek(mf, 0, SEEK_SET);
    uint8_t *bin = malloc((size_t)mlen);
    if (!bin || fread(bin, 1, (size_t)mlen, mf) != (size_t)mlen) {
        fprintf(stderr, "read failed\n"); return 1;
    }
    fclose(mf);

    if (!mhsi_load(bin, (size_t)mlen)) { fprintf(stderr, "mhsi_load failed\n"); return 1; }
    if (!load_vocab(argv[2])) { fprintf(stderr, "vocab load failed: %s\n", argv[2]); return 1; }
    int n_tokens = atoi(argv[3]);
    if (n_tokens <= 0 || n_tokens > 256) n_tokens = 64;

    char prompt[2048] = {0};
    if (argc >= 5) {
        snprintf(prompt, sizeof(prompt), "%s", argv[4]);
    } else {
        fgets(prompt, sizeof(prompt), stdin);
        int l = (int)strlen(prompt);
        if (l > 0 && prompt[l - 1] == '\n') prompt[l - 1] = '\0';
    }

    /* Reset GLA state */
    memset(g_Sf, 0, sizeof(g_Sf)); memset(g_zf, 0, sizeof(g_zf));
    memset(g_Sm, 0, sizeof(g_Sm)); memset(g_zm, 0, sizeof(g_zm));

    int toks[512]; int n = encode_prompt(prompt, toks, 512);
    if (n == 0) { fprintf(stderr, "prompt encoded to 0 tokens\n"); return 1; }

    float x[MHS_D];
    int pos = 0;
    for (int i = 0; i < n && i < g_block_size; i++) {
        embed_token(toks[i], x);
        for (int k = 0; k < (int)g_d; k++) x[k] += g_pos_buf[(size_t)pos * g_d + k];
        pos++;
        for (uint32_t L = 0; L < g_n_layers; L++) block_forward(x, (int)L, &g_blocks[L]);
        /* If the prompt itself ends with 'blurb:' we keep the last state and
         * generate; otherwise we still generate from the last token state. */
    }
    /* Final layer norm */
    layer_norm_b(x, g_ln_f, g_ln_f_bias, (int)g_d);

    srand((unsigned)time(NULL));
    g_recent_n = 0;

    /* Generate continuation */
    for (int t = 0; t < n_tokens; t++) {
        int tok = sample_token(x);
        if (tok >= 0 && tok < g_vocab_n && g_vocab_chars[tok][0]) {
            printf("%s", g_vocab_chars[tok]);
        }
        embed_token(tok, x);
        for (int k = 0; k < (int)g_d; k++) x[k] += g_pos_buf[(size_t)(pos % g_block_size) * g_d + k];
        pos++;
        for (uint32_t L = 0; L < g_n_layers; L++) block_forward(x, (int)L, &g_blocks[L]);
        layer_norm_b(x, g_ln_f, g_ln_f_bias, (int)g_d);
    }
    printf("\n");
    fflush(stdout);
    free(bin);
    return 0;
}
