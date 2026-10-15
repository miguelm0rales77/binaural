#version 300 es
// Fractal estadístico (fBm con domain warping) a pantalla completa. Copia de `cpuField.ts`:
// si cambias una cosa aquí, cámbiala también allí (las pruebas de seguridad y de dimensión se hacen con la copia CPU).
precision highp float;
precision highp int;

out vec4 outColor;

uniform float u_t;        // tiempo de la escena (s), ya multiplicado por la velocidad
uniform vec2 u_res;       // resolución del búfer de dibujo
uniform float u_gain;     // 2^(-H)
uniform float u_warp;     // domain warping, 0–4
uniform float u_brightness;
uniform float u_lung;     // llenado pulmonar 0–1 (0,5 sin respiración)
uniform vec3 u_pa;
uniform vec3 u_pb;
uniform vec3 u_pc;
uniform vec3 u_pd;
uniform int u_seed;
uniform int u_octaves;    // 6 en escritorio, 5 en móvil (o menos si se degrada)

// Rotación fija de 37° (columnas: (cos, sin) y (−sin, cos)).
const mat2 ROT = mat2(0.79863551, 0.60181502, -0.60181502, 0.79863551);

// Hash entero de 32 bits: el mismo cálculo en GPU y en CPU (no usar fract(sin(…))).
uint hashU(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v.x ^ v.y;
}

// Una de 8 direcciones unitarias.
vec2 dirOf(uint k) {
  float a = float(k) * 0.78539816;
  return vec2(cos(a), sin(a));
}

// Ruido de gradiente 2D con interpolación quíntica.
float gradNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float d00 = dot(dirOf(hashU(uvec2(ivec2(i) + ivec2(u_seed))) & 7u), f);
  float d10 = dot(dirOf(hashU(uvec2(ivec2(i) + ivec2(1, 0) + ivec2(u_seed))) & 7u), f - vec2(1.0, 0.0));
  float d01 = dot(dirOf(hashU(uvec2(ivec2(i) + ivec2(0, 1) + ivec2(u_seed))) & 7u), f - vec2(0.0, 1.0));
  float d11 = dot(dirOf(hashU(uvec2(ivec2(i) + ivec2(1, 1) + ivec2(u_seed))) & 7u), f - vec2(1.0, 1.0));
  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y);
}

// fBm: suma de octavas con lacunaridad 2 y ganancia u_gain; devuelve la media ponderada.
float fbm(vec2 p) {
  float a = 1.0;
  float s = 0.0;
  float n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= u_octaves) break;
    s += a * gradNoise(p);
    n += a;
    p = ROT * p * 2.0;
    a *= u_gain;
  }
  return s / n;
}

vec3 palette(float t) {
  return u_pa + u_pb * cos(6.28318 * (u_pc * t + u_pd));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y * 3.0;
  float breath = 2.0 * u_lung - 1.0;
  float warp = u_warp * (1.0 + 0.1 * breath);
  p *= 1.0 - 0.03 * breath;   // expansión muy leve con la respiración

  vec2 q = vec2(fbm(p + u_t * 0.010), fbm(p + vec2(5.2, 1.3) - u_t * 0.008));
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2)), fbm(p + warp * q + vec2(8.3, 2.8)));
  float v = fbm(p + warp * r);

  vec3 base = palette(v);
  vec3 second = palette(length(q) * 0.5);
  float m = clamp(0.5 + 0.5 * r.x, 0.0, 1.0);
  float bright = u_brightness * (1.0 + 0.06 * breath) * (0.8 + 0.4 * m);
  vec3 col = mix(base, second, 0.35) * bright;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
