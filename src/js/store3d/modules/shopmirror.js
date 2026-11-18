// VIDEOTHEK LENZ · Modul `shopmirror` (1.17.0): gewölbter Überwachungsspiegel über der Eingangstür (innen, unter der Decke).
// Kuppel (Halbkugel) + Rahmen + Haltestange als EIN Mesh (1 Draw-Call). Eine Weitwinkelkamera (~110°) rendert den Laden in eine 256er-RT, die auf die
// Kuppel projiziert wird. Ab mid live (10 Hz, high 20 Hz), bei low und in XR matter Verlauf (kein Render, keine RT). Höchstens ein Spiegel live (Hub).
// Provider 'shopmirror': keine öffentliche API (Vertrag §5). Die Gruppe heißt `m3-shopmirror`, damit city.partition() sie mit der Ladenhülle ausblendet.
import {
  Group, Mesh, SphereGeometry, TorusGeometry, ShaderMaterial, PerspectiveCamera, Vector3, Quaternion, Frustum, Matrix4, Sphere, Float32BufferAttribute,
} from 'three';
import { box, merge } from '../util/geo.js';
import { makeTarget, renderToTarget, mirrorHz, mirrorGate, liveHub, LAYER_MIRROR, MIRROR_FAR } from '../world/mirror.js';

export const DOME_R = 0.17;
/** Der Überwachungsspiegel sieht man auch aus dem Laden weiter weg als Planspiegel. */
export const DOME_MAX_DIST = 10;
export const DOME_FOV = 110;

const VERT = /* glsl */ `
attribute float aMir;
varying float vMir;
varying vec3 vCol;
varying vec2 vP;
varying vec3 vN;
void main() {
  vMir = aMir;
  vCol = color;
  vP = position.xy / ${DOME_R.toFixed(3)};
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uLive;
varying float vMir;
varying vec3 vCol;
varying vec2 vP;
varying vec3 vN;
void main() {
  vec3 c = vCol;
  if (vMir > 0.5) {
    float r = clamp(length(vP), 0.0, 1.0);
    vec3 m;
    if (uLive > 0.5) m = texture2D(tDiffuse, vec2(0.5 - 0.5 * vP.x, 0.5 + 0.5 * vP.y)).rgb * vec3(0.95, 0.98, 1.0);
    else m = mix(vec3(0.46, 0.52, 0.58), vec3(0.2, 0.24, 0.3), r);
    c = m * (1.0 - 0.45 * r * r) + vec3(0.04) * (1.0 - vN.z);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function tagged(g, color, mir) {
  const n = g.attributes.position.count;
  if (!g.attributes.color) {
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2]; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
  }
  g.setAttribute('aMir', new Float32BufferAttribute(new Float32Array(n).fill(mir), 1));
  return g;
}

/** Geometrie in lokalen Koordinaten: Pol der Kuppel +z, Rahmenring in der Ebene z = 0, Haltestange nach −z. */
export function domeGeometry() {
  const dome = new SphereGeometry(DOME_R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  const ring = new TorusGeometry(DOME_R + 0.012, 0.018, 6, 20);
  const stalk = box({ w: 0.04, h: 0.04, d: 0.5, z: -0.27, color: [0.2, 0.21, 0.25] });
  return merge([tagged(dome, [1, 1, 1], 1), tagged(ring, [0.82, 0.62, 0.15], 0), tagged(stalk, [0.2, 0.21, 0.25], 0)]);
}

/**
 * Kuppelmitte und Blickziel im Laden (rein). Über der Eingangstür (Südwand, innen) unter der Decke, Blick schräg in den Laden.
 * Die Nordecken scheiden aus: dort stehen bei Bedarf der Ab-18-Raum (Nordost) und die Kinder-Ecke (Nordwest) mit Vollwänden.
 */
export function domeSpot(L) {
  const w = Number.isFinite(L.w) ? L.w : 12;
  const d = Number.isFinite(L.d) ? L.d : 9;
  const ceil = Number.isFinite(L.ceilH) ? L.ceilH : 3;
  const pos = { x: w / 2, y: ceil - 0.28, z: d - 0.45 };
  const target = { x: w / 2, y: 1.0, z: d * 0.3 };
  return { pos, target };
}

export default {
  name: 'shopmirror',
  init(ctx) {
    const off = ctx.provide('shopmirror', {});
    const L = ctx.layout;
    if (!L || !ctx.renderer || !ctx.scene || !ctx.camera) return { dispose() { off(); } };
    const spot = domeSpot(L);
    const group = new Group();
    group.name = 'm3-shopmirror';
    const mat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uLive: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
    });
    const mesh = new Mesh(domeGeometry(), mat);
    mesh.name = 'shopmirror-dome';
    const cam = new PerspectiveCamera(DOME_FOV, 1, 0.12, MIRROR_FAR);
    cam.layers.set(0);
    cam.layers.enable(LAYER_MIRROR);
    const n = new Vector3(spot.target.x - spot.pos.x, spot.target.y - spot.pos.y, spot.target.z - spot.pos.z).normalize();
    cam.position.set(spot.pos.x + n.x * 0.12, spot.pos.y + n.y * 0.12, spot.pos.z + n.z * 0.12);
    cam.lookAt(spot.target.x, spot.target.y, spot.target.z);
    cam.updateMatrixWorld(true);
    // lokale Achsen der Kuppel: z = Blickrichtung, x = −Kamera-x (Spiegelbild), y = Kamera-y
    mesh.quaternion.copy(cam.quaternion).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
    mesh.position.set(spot.pos.x, spot.pos.y, spot.pos.z);
    group.add(mesh);
    ctx.scene.add(group);
    ctx.track(group);
    mesh.updateMatrixWorld(true);

    const hub = liveHub(ctx.renderer || ctx);
    const frus = new Frustum();
    const pv = new Matrix4();
    const sph = new Sphere(new Vector3(spot.pos.x, spot.pos.y, spot.pos.z), DOME_R * 1.6);
    let rt = null;
    let acc = 1;
    let live = false;
    let rendered = false;
    let renders = 0;
    const chainVisible = () => { for (let o = mesh; o; o = o.parent) if (o.visible === false) return false; return true; };
    const setLive = (v) => { live = v; mat.uniforms.uLive.value = v && rendered ? 1 : 0; };

    return {
      update(dt) {
        const level = ctx.quality();
        const xr = !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
        const store = !(ctx.stage && typeof ctx.stage.isStore === 'function') || ctx.stage.isStore();
        if (xr || mirrorHz(level) <= 0 || !store) { if (live) { setLive(false); hub.release('shopmirror'); } return; }
        const c = ctx.camera;
        c.updateMatrixWorld();
        pv.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
        frus.setFromProjectionMatrix(pv);
        const dist = c.position.distanceTo(sph.center);
        const visible = chainVisible() && frus.intersectsSphere(sph);
        if (!mirrorGate({ quality: level, xr, store, visible, facing: true, dist, maxDist: DOME_MAX_DIST })) { hub.release('shopmirror'); return; }
        if (!hub.claim('shopmirror', dist, typeof performance !== 'undefined' ? performance.now() : Date.now())) return;
        acc += dt;
        if (acc < 1 / mirrorHz(level)) return;
        acc = 0;
        if (!rt) { rt = makeTarget(256); mat.uniforms.tDiffuse.value = rt.texture; }
        renderToTarget(ctx.renderer, ctx.scene, cam, rt, [mesh]);
        renders++;
        rendered = true;
        setLive(true);
      },
      stats: () => ({ renders, live: live && rendered, hasTarget: !!rt }),
      dispose() {
        hub.release('shopmirror');
        group.removeFromParent();
        mesh.geometry.dispose();
        mat.dispose();
        if (rt) { rt.dispose(); rt = null; }
        off();
      },
    };
  },
};
