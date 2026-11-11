// Post-processing: HDR scene target -> bloom -> filmic composite with grain,
// vignette, chromatic aberration, lens distortion, glitch and fear effects.
import * as THREE from '../vendor/three.module.min.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = /* glsl */`
precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(8.0)), 1.0);
}`;

const BLUR = /* glsl */`
precision highp float;
uniform sampler2D tMap; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb * 0.227027;
  c += (texture2D(tMap, vUv + uDir * 1.3846).rgb + texture2D(tMap, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture2D(tMap, vUv + uDir * 3.2308).rgb + texture2D(tMap, vUv - uDir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = /* glsl */`
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBloom2;
uniform vec2 uRes;
uniform float uTime, uGrain, uVignette, uChroma, uGlitch, uFade, uBloom, uDistort, uDesat, uPulse, uFlash, uExposure, uStatic, uBlur, uSlats, uPeek;
uniform vec3 uFlashColor; uniform vec3 uTint;
varying vec2 vUv;

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = vUv;
  if (uGlitch > 0.001) {
    float line = floor(uv.y * 34.0);
    float n = hash(vec2(line, floor(uTime * 22.0)));
    if (n < uGlitch * 0.55) uv.x += (hash(vec2(line * 3.1, floor(uTime * 31.0))) - 0.5) * 0.3 * uGlitch;
    uv.y += (hash(vec2(floor(uTime * 17.0), 2.0)) - 0.5) * 0.05 * uGlitch;
  }
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  uv = 0.5 + c * (1.0 + uDistort * r2 - uDistort * 0.25);
  vec2 dir = c * (uChroma * (0.25 + r2 * 2.5));
  vec3 col;
  if (uBlur > 0.001) {
    vec2 b = uBlur / uRes * 6.0;
    col = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + uTime * 0.3;
      vec2 o = vec2(cos(a), sin(a)) * b;
      col.r += texture2D(tScene, uv + o + dir).r; col.g += texture2D(tScene, uv + o).g; col.b += texture2D(tScene, uv + o - dir).b;
    }
    col /= 6.0;
  } else {
    col.r = texture2D(tScene, uv + dir).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - dir).b;
  }
  col += (texture2D(tBloom, uv).rgb * 0.6 + texture2D(tBloom2, uv).rgb * 0.9) * uBloom;
  col *= uExposure;
  col = aces(col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), uDesat);
  col *= uTint;
  col += vec3(0.004, 0.009, 0.012) * (1.0 - smoothstep(0.0, 0.25, l));   // cold lifted blacks
  // vignette
  float d = length(c * vec2(1.0, 0.85));
  col *= mix(1.0, smoothstep(0.95, 0.25, d), uVignette);
  // fear: pulsing blood-dark edges
  col = mix(col, col * vec3(0.9, 0.12, 0.08), uPulse * smoothstep(0.25, 0.75, d));
  // analogue static
  if (uStatic > 0.001) {
    float s = hash(floor(gl_FragCoord.xy / 2.0) + fract(uTime * 13.7) * 97.0);
    float bars = step(0.92, hash(vec2(floor(uv.y * 60.0), floor(uTime * 20.0))));
    col = mix(col, vec3(s) * (0.6 + bars), uStatic);
  }
  // locker slats
  if (uSlats > 0.001) {
    float y = fract(vUv.y * 7.0 + 0.2);
    float bar = smoothstep(0.16, 0.23, y) * (1.0 - smoothstep(0.66, 0.73, y));
    float side = smoothstep(0.02, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 0.98, vUv.x));
    float open = bar * side * step(0.12, vUv.y) * step(vUv.y, 0.9);
    col *= mix(1.0, open, uSlats);
  }
  // peek through a door slot
  if (uPeek > 0.001) {
    vec2 q = abs(vUv - vec2(0.5, 0.52)) / vec2(0.36, 0.2);
    float m = 1.0 - smoothstep(0.85, 1.05, max(q.x, q.y));
    col *= mix(1.0, m, uPeek);
  }
  col = mix(col, uFlashColor, uFlash);
  col *= (1.0 - uFade);
  col = mix(col * 12.92, 1.055 * pow(max(col, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  // film grain, applied in display space so it stays even across the tonal range
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 911.0) - 0.5;
  col += g * uGrain * (1.0 - uFade) * (0.55 + 0.45 * (1.0 - l));
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quality = 'high';
    // HDR targets need float colour buffers; fall back to 8-bit where a GPU lacks them.
    const ex = renderer.extensions;
    this.rtType = ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.75 } });
    this.mBlur = mk(BLUR, { tMap: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.u = {
      tScene: { value: null }, tBloom: { value: null }, tBloom2: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uGrain: { value: 0.075 }, uVignette: { value: 0.9 }, uChroma: { value: 0.006 }, uGlitch: { value: 0 },
      uFade: { value: 1 }, uBloom: { value: 0.55 }, uDistort: { value: 0.08 }, uDesat: { value: 0.22 },
      uPulse: { value: 0 }, uFlash: { value: 0 }, uExposure: { value: 1.0 }, uStatic: { value: 0 }, uBlur: { value: 0 },
      uSlats: { value: 0 }, uPeek: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) }, uTint: { value: new THREE.Color(0.94, 1.0, 0.97) },
    };
    this.mFinal = mk(FINAL, this.u);
    this.rtScene = null;
  }

  setSize(w, h, quality) {
    this.quality = quality;
    for (const k of ['rtScene', 'rtA', 'rtB', 'rtC', 'rtD', 'rtE']) if (this[k]) this[k].dispose();
    const samples = quality === 'high' ? 4 : quality === 'medium' ? 2 : 0;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: this.rtType, samples, depthBuffer: true });
    const o = { type: this.rtType, depthBuffer: false };
    const w2 = Math.max(2, w >> 1), h2 = Math.max(2, h >> 1), w4 = Math.max(2, w >> 2), h4 = Math.max(2, h >> 2), w8 = Math.max(2, w >> 3), h8 = Math.max(2, h >> 3);
    this.rtA = new THREE.WebGLRenderTarget(w2, h2, o);
    this.rtB = new THREE.WebGLRenderTarget(w4, h4, o);
    this.rtC = new THREE.WebGLRenderTarget(w4, h4, o);
    this.rtD = new THREE.WebGLRenderTarget(w8, h8, o);
    this.rtE = new THREE.WebGLRenderTarget(w8, h8, o);
    this.u.uRes.value.set(w, h);
    this.w = w; this.h = h;
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    this.u.uTime.value = time;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);

    if (this.quality !== 'low') {
      this.mBright.uniforms.tMap.value = this.rtScene.texture;
      this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      this._pass(this.mBright, this.rtA);
      const blur = (src, tmp, dst, s) => {
        this.mBlur.uniforms.tMap.value = src.texture; this.mBlur.uniforms.uDir.value.set(s / tmp.width, 0); this._pass(this.mBlur, tmp);
        this.mBlur.uniforms.tMap.value = tmp.texture; this.mBlur.uniforms.uDir.value.set(0, s / dst.height); this._pass(this.mBlur, dst);
      };
      blur(this.rtA, this.rtB, this.rtC, 1.0);
      blur(this.rtC, this.rtD, this.rtE, 1.2);
      // second iteration widens the far glow
      this.mBlur.uniforms.tMap.value = this.rtE.texture; this.mBlur.uniforms.uDir.value.set(1.5 / this.rtD.width, 0); this._pass(this.mBlur, this.rtD);
      this.mBlur.uniforms.tMap.value = this.rtD.texture; this.mBlur.uniforms.uDir.value.set(0, 1.5 / this.rtE.height); this._pass(this.mBlur, this.rtE);
      this.u.tBloom.value = this.rtC.texture; this.u.tBloom2.value = this.rtE.texture;
    } else {
      this.u.tBloom.value = this.rtScene.texture; this.u.tBloom2.value = this.rtScene.texture;
    }
    this.u.tScene.value = this.rtScene.texture;
    const bloom = this.u.uBloom.value;
    if (this.quality === 'low') this.u.uBloom.value = 0;
    this._pass(this.mFinal, null);
    this.u.uBloom.value = bloom;
  }
}
