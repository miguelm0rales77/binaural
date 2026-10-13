#version 300 es
precision highp float;
precision highp int;

// Fractal estadístico (fBm con domain warping). Sin destellos: nada pulsa al ritmo del audio.
// OCTAVES se define desde JS (6 en escritorio, 5 en móvil o en modo de calidad reducida).
#ifndef OCTAVES
#define OCTAVES 3
#endif

out vec4 fragColor;

uniform vec2 u_res;
uniform float u_t;
uniform float u_gain;
uniform float u_warp;
uniform float u_brightness;
uniform float u_lung;
uniform vec3 u_pal[4];
uniform uint u_seed;

const mat2 ROT = mat2(0.7986, 0.6018, -0.6018, 0.7986); // rotación fija de ~37°

uint hash(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v.x ^ v.y;
}

vec2 grad(uvec2 c) {
  uint h = hash(c) & 7u;
  float a = float(h) * 0.78539816;
  return vec2(cos(a), sin(a));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  uvec2 ui = uvec2(ivec2(i)) + uvec2(u_seed);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(ui), f);
  float b = dot(grad(ui + uvec2(1u, 0u)), f - vec2(1.0, 0.0));
  float c = dot(grad(ui + uvec2(0u, 1u)), f - vec2(0.0, 1.0));
  float d = dot(grad(ui + uvec2(1u, 1u)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float a = 1.0;
  float s = 0.0;
  float n = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    s += a * noise(p);
    n += a;
    p = ROT * p * 2.0;
    a *= u_gain;
  }
  return s / n;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y * 3.0;
  // La respiración: escala del campo ±3 % y warp ±10 % (u_lung en 0–1, 0,5 = neutro)
  float breath = u_lung - 0.5;
  p *= 1.0 + 0.06 * breath;
  float w = u_warp * (1.0 + 0.2 * breath);

  vec2 q = vec2(fbm(p + u_t * 0.010), fbm(p + vec2(5.2, 1.3) - u_t * 0.008));
  vec2 r = vec2(fbm(p + w * q + vec2(1.7, 9.2)), fbm(p + w * q + vec2(8.3, 2.8)));
  float v = fbm(p + w * r);

  float t = 0.5 + 0.9 * v + 0.25 * (length(q) - 0.5) + 0.15 * r.x;
  vec3 col = u_pal[0] + u_pal[1] * cos(6.28318 * (u_pal[2] * t + u_pal[3]));
  // Brillo: el aliento lo modula ±2 % (oscilación total 4 %; con 3 octavas, el total de la prueba de destellos queda bajo el 8 %)
  float bright = u_brightness * (1.0 + 0.04 * breath);
  fragColor = vec4(clamp(col * bright, 0.0, 1.0), 1.0);
}
