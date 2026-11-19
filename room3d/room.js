// 4F 열람실 눈높이 3D 프로토타입 v2 — Argon 4차 스펙 + 1차 검수 TOP3 + 유저 피드백(잘림·바닥 네비 가이드).
// 방·가구: 절차적 박스 + 갈색 윤곽선. 벽은 안쪽만 보이는 단면(카메라가 벽 밖으로 나가도 통과). 캐릭터: 2D 빌보드.
import * as THREE from 'three';
// ---------- 앱 브리지 / 파라미터 (?uid&nick&animal&ch&lock=1&seat=N&sb=URL&key=KEY) ----------
const Q = new URLSearchParams(location.search);
const ME = { uid: Q.get('uid') || `guest-${Math.random().toString(36).slice(2, 8)}`, nick: Q.get('nick') || '손님', animal: Q.get('animal') || 'rabbit', ch: Q.get('ch') || '12', lock: Q.get('lock') === '1', seat: Number(Q.get('seat') || 0) || 0 };
const send = (type, payload = {}) => { const msg = JSON.stringify({ type, ...payload }); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); else if (window.parent !== window) window.parent.postMessage(msg, '*'); };

const C = { wall: 0xF6EDDC, part: 0xF7EFE1, wood: 0xDFC19B, woodDark: 0xC9A273, lamp: 0xF2A6A6, line: 0x5C4033, floor: 0xE8D6B8, peach: 0xF49D6E, sky: 0xD6ECF2, plant: 0x9CC5A0, book: [0xF2A6A6, 0x9CC5C9, 0xF8E5A6, 0xA4D2E6] };
// 일 모드(?mode=office, 11-08 찹쌀떡 공유오피스 docs/decisions/office_20261108.md): 넓은 홀 네 벽을 따라 사무실 24개 + 가운데 라운지(아르곤 13차 A 아트리움)
const WORK = Q.get('mode') === 'office';
if (WORK) Object.assign(C, { wall: 0xF3EEE6, part: 0xE6E2DA, wood: 0xE8D3B4, woodDark: 0xB89A7A, floor: 0xD9CEC0, lamp: 0xF49D6E });
const ROOM = WORK ? { w: 25.6, d: 25.6 } : { w: 14, d: 18 };                       // x∈[-7,7] z∈[-9,9], 창문 벽 z=-9, 출입문 z=+9
let SPEED = 2.2; let STRIDE_CYCLE = SPEED * 0.4;    // m/s · 걷기 4컷 한 바퀴 = 400ms(10fps) @전속 → 거리 0.88m (프리셋 cycle 로 갱신)
const CAM = { fov: 70, back: 3.2, h: 1.75, overH: 2.3, lookAhead: 1.0, lookH: 0.55, lookSens: 0.35 * Math.PI / 180 }; // 세로 화면 수직 FOV 70°, 거리 3.2m 고정, 피치 약 -14°
const NEAR = 1.1, NET_HZ = 8, NET_LERP = 0.18, LABEL_R = 3.5, GRID = 0.4, COLLIDE_R = 0.5;
// 보행 보조 모션 프리셋 — URL ?motion=v2|v3 로 전환해 전후 비교
const MOTION_PRESETS = {
  v2: { cycle: 0.4, rollDeg: 3.5, pivot: 'feet', swayCm: 0, bobCm: 2.0, bobPhase: Math.PI / 2, sqY: 0.045, sqX: 0.04, sqFreq: 2, turnPop: true, holds: [1, 1, 1, 1] },
  v3: { cycle: 0.4, rollDeg: 0, pivot: 'center', swayCm: 1.0, bobCm: 2.5, bobPhase: Math.PI / 2, sqY: 0.02, sqX: 0.01, sqFreq: 2, turnPop: false, holds: [1, 1, 1, 1], speed: 2.2 },
  // v4 (조사 + 아르곤 확정): 회전 0, 좌우 평행 이동 ±0.6cm(통과 컷 최대), 코드 bob 0(아트 1cm), 스쿼시 프레임 락 ±2%, 1.65m/s·520ms, 접지 56/통과 44, 정면·뒷면 좌우 반전 대칭
  v4: { cycle: 0.52, rollDeg: 0, pivot: 'center', swayCm: 0.6, bobCm: 0, bobPhase: 0, sqY: 0, sqX: 0, sqFreq: 2, turnPop: false, holds: [54, 46, 54, 46], speed: 1.65, lockSquash: true, mirrorFB: false },   // 정면·뒷면 접지 L/R 은 서기 컷에서 합성(synth_legs.py) → 반전 불필요   // 접지 140ms · 통과 120ms
};
const MOTION = MOTION_PRESETS[new URLSearchParams(location.search).get('motion')] ?? MOTION_PRESETS.v4;
window.MOTION = MOTION; SPEED = MOTION.speed ?? SPEED; STRIDE_CYCLE = SPEED * MOTION.cycle;

// ---------- 렌더러·씬 ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(C.wall); scene.fog = new THREE.FogExp2(C.wall, 0.028);   // 먼 쪽을 크림색 공기로 흐리게(깊이감)
const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.05, 60);
scene.add(new THREE.HemisphereLight(0xFFFBF2, 0xE8D6B8, 2.6));
const sun = new THREE.DirectionalLight(0xFFF4E0, 1.4); sun.position.set(-4, 8, -6); scene.add(sun);

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const seeThru = (c, op) => new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: op, depthWrite: false });
const lineMat = new THREE.LineBasicMaterial({ color: C.line, transparent: true });
const box = (w, h, d, c, x, y, z, parent = scene, outline = true) => {
  const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, mat(c)); m.position.set(x, y, z); parent.add(m);
  if (outline) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat.clone()));
  return m;
};
const cyl = (rt, rb, h, c, x, y, z, parent = scene) => { const g = new THREE.CylinderGeometry(rt, rb, h, 14); const m = new THREE.Mesh(g, mat(c)); m.position.set(x, y, z); parent.add(m); return m; };
// 벽: 안쪽 면만 렌더(FrontSide) → 카메라가 벽 밖으로 나가면 벽이 사라져 잘림 없음
const wall = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: C.wall, side: THREE.FrontSide })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
box(ROOM.w, 0.05, ROOM.d, C.floor, 0, -0.025, 0);
if (WORK) for (let i = -8; i <= 8; i++) for (const [w, d, x, z] of [[ROOM.w, 0.02, 0, i * 1.6], [0.02, ROOM.d, i * 1.6, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xD2C6B7 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); scene.add(m); }   // 카펫 타일 줄
else for (let z = -ROOM.d / 2 + 0.6; z < ROOM.d / 2; z += 0.6) { const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, 0.035), new THREE.MeshBasicMaterial({ color: 0xE2C8A4 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.002, z); scene.add(m); }   // 원목 마루 선(이동 속도감)
if (!WORK) box(2.0, 0.006, 15.5, 0xF9F2E7, 0, 0.003, 0.2);                                                                                                   // 중앙 복도 러그
if (!WORK) for (const [x, z] of [[-3.4, -4], [3.4, -4], [-3.4, 2.6], [3.4, 2.6]]) { cyl(0.012, 0.012, 0.7, C.line, x, 3.45, z); cyl(0.0, 0.28, 0.22, C.lamp, x, 3.0, z); }   // 펜던트 조명
if (!WORK) cyl(0.42, 0.42, 0.06, 0xFA644F, 0, 3.05, ROOM.d / 2 - 0.06).rotation.x = Math.PI / 2; if (!WORK) cyl(0.34, 0.34, 0.03, 0xFFFDF9, 0, 3.05, ROOM.d / 2 - 0.1).rotation.x = Math.PI / 2;   // 뒷벽 토마토 벽시계
wall(ROOM.w, 3.8, 0, 1.9, -ROOM.d / 2, 0); wall(ROOM.w, 3.8, 0, 1.9, ROOM.d / 2, Math.PI);
wall(ROOM.d, 3.8, -ROOM.w / 2, 1.9, 0, Math.PI / 2); wall(ROOM.d, 3.8, ROOM.w / 2, 1.9, 0, -Math.PI / 2);
// 천장 몰딩 띠 + 창(하늘색 + 십자 창살 + 화분)
box(ROOM.w, 0.12, 0.12, C.woodDark, 0, 3.74, -ROOM.d / 2 + 0.06, scene, false);
const WIN_X = WORK ? [-10.8, -7.2, -3.6, 0, 3.6, 7.2, 10.8] : [-4, 0, 4], WIN_W = WORK ? 2.4 : 3.2;
for (const x of WIN_X) {
  box(WIN_W, 1.9, 0.06, C.sky, x, 1.95, -ROOM.d / 2 + 0.06);
  box(0.06, 1.9, 0.08, C.line, x, 1.95, -ROOM.d / 2 + 0.1, scene, false); box(WIN_W, 0.06, 0.08, C.line, x, 1.95, -ROOM.d / 2 + 0.1, scene, false);
  if (!WORK) box(3.3, 0.1, 0.3, C.wood, x, 0.95, -ROOM.d / 2 + 0.15); if (!WORK) for (const dx of [-1.1, 0, 1.1]) { box(0.3, 0.22, 0.22, C.lamp, x + dx, 1.11, -ROOM.d / 2 + 0.2, scene, false); cyl(0.17, 0.12, 0.26, C.plant, x + dx, 1.35, -ROOM.d / 2 + 0.2); }
}
if (!WORK) { box(1.1, 2.2, 0.08, C.woodDark, 0, 1.1, ROOM.d / 2 - 0.05); box(0.5, 0.5, 0.06, C.sky, 0, 1.6, ROOM.d / 2 - 0.1); }   // 출입문
if (!WORK) for (const x of [-5.2, 5.2]) { box(2.6, 2.1, 0.4, C.wood, x, 1.05, -ROOM.d / 2 + 0.3); for (let i = 0; i < 3; i++) for (let j = 0; j < 7; j++) box(0.26, 0.5, 0.2, C.book[(i + j) % 4], x - 1.1 + j * 0.36, 0.45 + i * 0.62, -ROOM.d / 2 + 0.42); }
if (!WORK) { box(0.9, 0.75, 0.9, C.woodDark, -5.6, 0.375, -ROOM.d / 2 + 1.3); box(0.5, 0.05, 0.5, C.part, -5.6, 0.78, -ROOM.d / 2 + 1.3); } // 다과 테이블
const sph = (r, c, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat(c)); m.position.set(x, y, z); parent.add(m); return m; };
const lounge = [];   // 라운지 가구 충돌 블록
if (WORK) {   // 가운데 라운지: 큰 나무 + 둥근 벤치, 동서 소파·낮은 탁자, 남서 커피 바, 북쪽 의견 게시판, 네 모서리 화분
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: 0xEBDFCC })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004; scene.add(disc);
  cyl(1.6, 1.6, 0.42, C.wood, 0, 0.21, 0); cyl(1.2, 1.2, 0.5, 0x8C6A4F, 0, 0.3, 0); cyl(0.25, 0.38, 2.6, 0x9A7457, 0, 1.6, 0);
  for (const [x, y, z, r] of [[0, 3.3, 0, 1.1], [0.75, 3.0, 0.35, 0.75], [-0.75, 3.05, -0.25, 0.8], [0.15, 2.95, -0.75, 0.7]]) sph(r, 0x8DBF8B, x, y, z);
  lounge.push({ x0: -1.6, x1: 1.6, z0: -1.6, z1: 1.6 });
  for (const sx of [-1, 1]) {
    box(0.9, 0.42, 2.4, 0xE5987E, sx * 4.6, 0.21, 0); box(0.2, 0.8, 2.4, 0xE5987E, sx * 5.0, 0.4, 0);   // 소파(등받이는 바깥쪽)
    box(0.8, 0.36, 1.4, C.wood, sx * 3.5, 0.18, 0);                                                        // 낮은 탁자
    lounge.push({ x0: sx > 0 ? 3.1 : -5.1, x1: sx > 0 ? 5.1 : -3.1, z0: -1.2, z1: 1.2 });
  }
  box(2.4, 1.0, 0.7, 0xEADBCA, -4.6, 0.5, 5.0); box(0.45, 0.55, 0.4, 0x4A443F, -5.3, 1.28, 5.0); cyl(0.05, 0.04, 0.09, 0xE88269, -4.6, 1.05, 5.0);   // 커피 바
  lounge.push({ x0: -5.8, x1: -3.4, z0: 4.65, z1: 5.35 });
  box(2.2, 1.4, 0.1, C.woodDark, 0, 1.4, -5.6); box(2.0, 1.2, 0.02, 0xE8C9A0, 0, 1.4, -5.54, scene, false);   // 의견 게시판(나중에 누르면 열림)
  for (const [x, y, c] of [[-0.6, 1.6, 0xFFFDF9], [0.1, 1.7, 0xF8E5A6], [0.6, 1.3, 0xF2A6A6], [-0.3, 1.15, 0xA4D2E6]]) box(0.42, 0.34, 0.01, c, x, y, -5.52, scene, false);
  for (const x of [-0.95, 0.95]) cyl(0.04, 0.04, 0.7, C.woodDark, x, 0.35, -5.6);
  lounge.push({ x0: -1.1, x1: 1.1, z0: -5.7, z1: -5.5 });
  for (const [x, z] of [[-7.6, -7.6], [7.6, -7.6], [-7.6, 7.6], [7.6, 7.6]]) { cyl(0.35, 0.28, 0.6, 0xD98A6C, x, 0.3, z); sph(0.7, 0x7A9A76, x, 1.25, z); lounge.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 }); }
}

const cvTex0 = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
// ---------- 좌석 24석 (4열 × 6행, 행 간격 2.3m), 책상이 창(-z)을 향함. 낮은 칸막이 1.05m ----------
const SEAT_X = [-4.2, -2.6, 2.6, 4.2], SEAT_Z = [-6.2, -3.9, -1.6, 0.7, 3.0, 5.3];
// 일 모드 사무실 24개: 북 7(창가)·남 7·서 5·동 5. 책상은 열람실처럼 모두 -z 를 봐서 앉기·카메라 코드는 그대로. 사무실마다 라운지 쪽(open)이 통유리 + 문(door: 벽 가운데서 떨어진 거리)
// f: 소파[x,z](벽 쪽 등받이) · 탁자 · 책장[x,z,가로?] · 화분 — 모두 사무실 가운데 기준
const OW = 3.6, OD = 3.8, HW = ROOM.w / 2, HD = ROOM.d / 2;
const OFFICES = WORK ? [
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: (i - 3) * OW, z: -HD + OD / 2, w: OW, d: OD, open: 'S', door: 0.9, dx: -0.5, dz: -1.0, f: { sofa: [1.35, -0.6], table: [0.6, -0.6], shelf: [-1.6, 0.8, false], plant: [1.4, -1.55] } })),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: (i - 3) * OW, z: HD - OD / 2, w: OW, d: OD, open: 'N', door: -0.95, dx: 0.55, dz: -0.8, f: { sofa: [-1.35, 0.8], table: [-0.6, 0.8], shelf: [1.0, 1.7, true], plant: [1.45, -1.55] } })),
  ...[0, 1, 2, 3, 4].map((j) => ({ x: -HW + OD / 2, z: (j - 2) * OW, w: OD, d: OW, open: 'E', door: 0.6, dx: -0.3, dz: -0.9, f: { sofa: [-1.45, 0.8], table: [-0.7, 0.8], shelf: [-0.3, 1.62, true], plant: [1.5, -1.45] } })),
  ...[0, 1, 2, 3, 4].map((j) => ({ x: HW - OD / 2, z: (j - 2) * OW, w: OD, d: OW, open: 'W', door: 0.6, dx: 0.3, dz: -0.9, f: { sofa: [1.45, 0.8], table: [0.7, 0.8], shelf: [0.3, 1.62, true], plant: [-1.5, -1.45] } })),
] : null;
const SEAT_POS = WORK ? OFFICES.map((o) => [o.x + o.dx, o.z + o.dz]) : SEAT_Z.flatMap((z) => SEAT_X.map((x) => [x, z]));
const LIT = 0xFFE3A3, DIM = 0xE6DED3;   // 사무실 천장등: 출근하면 켜짐
const seats = [], partParts = [], officeBlocks = [];
SEAT_POS.forEach(([x, z], i) => {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const top = box(1.3, 0.06, 0.7, C.wood, 0, 0.7, 0, g);
  const desk = [top]; for (const sx of [-0.58, 0.58]) desk.push(box(0.06, 0.68, 0.6, C.woodDark, sx, 0.35, 0, g, false));
  const pL = WORK ? box(0.06, 0.68, 0.7, C.woodDark, -0.62, 0.34, 0, g) : box(0.06, 1.05, 0.9, C.part, -0.68, 0.525, 0.05, g), pR = WORK ? box(0.06, 0.68, 0.7, C.woodDark, 0.62, 0.34, 0, g) : box(0.06, 1.05, 0.9, C.part, 0.68, 0.525, 0.05, g);   // 일 모드는 큰 책상 옆판
  const pF = WORK ? box(1.24, 0.55, 0.04, C.woodDark, 0, 0.4, -0.3, g) : box(1.42, 0.85, 0.06, C.part, 0, 0.425, -0.38, g);   // 낮은 앞 판 (일 모드는 책상 앞 가림판)
  partParts.push(pL, pR, pF, top);
  if (WORK) { box(0.56, 0.34, 0.04, 0x3A3633, 0, 1.0, -0.22, g); box(0.5, 0.28, 0.01, 0xBFE0EA, 0, 1.0, -0.195, g, false); box(0.05, 0.16, 0.05, 0x3A3633, 0, 0.8, -0.24, g, false); cyl(0.05, 0.04, 0.09, 0xE88269, 0.42, 0.775, 0.05, g); }   // 모니터 + 머그
  else { cyl(0.02, 0.02, 0.3, C.lamp, 0.45, 0.88, -0.2, g); cyl(0.07, 0.15, 0.14, C.lamp, 0.45, 1.08, -0.2, g); }   // 스탠드 기둥 + 원뿔 갓
  const chairBase = new THREE.Group(); g.add(chairBase); chairBase.add(box(0.46, 0.06, 0.46, C.wood, 0, 0.45, 0.6, g)); for (const [sx, sz] of [[-0.2, 0.42], [0.2, 0.42], [-0.2, 0.78], [0.2, 0.78]]) chairBase.add(box(0.05, 0.45, 0.05, C.woodDark, sx, 0.22, sz, g, false));
  const chair = new THREE.Group(); g.add(chair); chair.add(box(0.46, 0.5, 0.05, C.wood, 0, 0.72, 0.82, g)); // 의자 등받이(착석 시 숨김)
  const no = i + 1, o = OFFICES?.[i];
  let light = null;
  if (WORK) {   // 사무실: 벽 3면 + 라운지 쪽 통유리(문 자리 비움) + 러그·천장등·소파·탁자·책장·화분 + 문 옆 문패
    const cx = o.x - x, cz = o.z - z, hw = o.w / 2, hd = o.d / 2, WH = 2.4, GAP = 1.4;
    box(o.w - 0.4, 0.01, o.d - 0.4, 0xF3E6D6, cx, 0.006, cz, g, false);
    light = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 1.2, o.d - 1.2), new THREE.MeshBasicMaterial({ color: DIM, side: THREE.DoubleSide })); light.rotation.x = Math.PI / 2; light.position.set(cx, WH - 0.02, cz); light.userData.fx = true; g.add(light);
    for (const side of ['N', 'S', 'W', 'E']) {
      const alongX = side === 'N' || side === 'S', len = alongX ? o.w : o.d, px = side === 'W' ? cx - hw : side === 'E' ? cx + hw : cx, pz = side === 'N' ? cz - hd : side === 'S' ? cz + hd : cz;
      const segs = side === o.open ? [[-len / 2, o.door - GAP / 2], [o.door + GAP / 2, len / 2]] : [[-len / 2, len / 2]];
      for (const [a, b] of segs) {
        const m = (a + b) / 2, L = b - a, wx = alongX ? px + m : px, wz = alongX ? pz : pz + m;
        if (side === o.open) { const gl = new THREE.Mesh(new THREE.BoxGeometry(alongX ? L : 0.04, WH - 0.1, alongX ? 0.04 : L), seeThru(C.sky, 0.22)); gl.position.set(wx, (WH - 0.1) / 2, wz); gl.userData.fx = true; g.add(gl); box(alongX ? L : 0.08, 0.1, alongX ? 0.08 : L, C.woodDark, wx, WH - 0.05, wz, g); }
        else partParts.push(box(alongX ? L : 0.08, WH, alongX ? 0.08 : L, C.part, wx, WH / 2, wz, g));
        officeBlocks.push(alongX ? { x0: x + wx - L / 2, x1: x + wx + L / 2, z0: z + wz - 0.05, z1: z + wz + 0.05 } : { x0: x + wx - 0.05, x1: x + wx + 0.05, z0: z + wz - L / 2, z1: z + wz + L / 2 });
      }
      if (side === o.open) {   // 문 위 상인방 + 그 앞 문패(라운지 쪽을 봄)
        const dxw = alongX ? px + o.door : px, dzw = alongX ? pz : pz + o.door; box(alongX ? GAP : 0.08, 0.5, alongX ? 0.08 : GAP, C.part, dxw, WH - 0.25, dzw, g);
        const out = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side];
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.24), new THREE.MeshBasicMaterial({ map: cvTex0(160, 64, (q) => { q.fillStyle = '#FFFDF9'; q.fillRect(0, 0, 160, 64); q.strokeStyle = '#5C4033'; q.lineWidth = 6; q.strokeRect(3, 3, 154, 58); q.fillStyle = '#3A261E'; q.font = 'bold 34px sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(`${no}호`, 80, 34); }), transparent: true }));
        sign.position.set(dxw + out[0] * 0.06, WH - 0.25, dzw + out[1] * 0.06); sign.rotation.y = Math.atan2(out[0], out[1]); sign.userData.fx = true; g.add(sign);
      }
    }
    const { sofa, table, shelf, plant } = o.f, SOFA = 0xE5987E;
    box(0.7, 0.4, 1.5, SOFA, cx + sofa[0], 0.2, cz + sofa[1], g); box(0.18, 0.75, 1.5, SOFA, cx + sofa[0] + Math.sign(sofa[0]) * 0.3, 0.37, cz + sofa[1], g, false);
    box(0.55, 0.32, 0.9, C.wood, cx + table[0], 0.16, cz + table[1], g, false);
    box(shelf[2] ? 1.2 : 0.32, 1.8, shelf[2] ? 0.32 : 1.2, C.woodDark, cx + shelf[0], 0.9, cz + shelf[1], g);
    for (let k = 0; k < 3; k++) box(shelf[2] ? 1.0 : 0.2, 0.32, shelf[2] ? 0.2 : 1.0, C.book[(k + i) % 4], cx + shelf[0], 0.45 + k * 0.5, cz + shelf[1], g, false);
    cyl(0.22, 0.17, 0.4, 0xD98A6C, cx + plant[0], 0.2, cz + plant[1], g); sph(0.42, 0x7A9A76, cx + plant[0], 0.8, cz + plant[1], g);
  }
  g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
  seats.push({ no, x, z, g, top, desk, pL, pR, light, chairBack: chair, chairBase, parts: [], behind: new THREE.Vector3(x, 0, z + 1.3), sit: new THREE.Vector3(x, 0, z + 0.58), occ: null });
});

// ---------- 스프라이트(빌보드) ----------
const loader = new THREE.TextureLoader();
const tex = (n) => { const t = loader.load(`assets/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; return t; };
const T = {};
const WALK_ANIMALS = ['rabbit', 'cat', 'bear', 'hamster', 'dog', 'capybara', 'duck', 'frog', 'quokka', 'otter'];   // 10종 보행 세트(앞/뒤/옆 × 5컷)
const CHAIR_ANIMALS = WALK_ANIMALS, CHAIR_CUTS = ['chair_back', 'chair_back34', 'chair_side', 'chair_front', 'chair_sleep_back'];   // 의자 일체형 착석 컷(파일럿)
for (const a of CHAIR_ANIMALS) { for (const c of CHAIR_CUTS) T[`${a}_${c}`] = tex(`${a}_${c}`); T[`${a}_emote_cheer`] = tex(`${a}_emote_cheer`); }
const DIRS = Q.get('dirs') === '4' ? 4 : 8, CHAIR_SZ = 1.05 * 512 / 440, CHAIR_CY = 20 / 512;   // 512 캔버스: 의자 다리 바닥 y=492, 앉은 키 440px = 1.05m
for (const a of WALK_ANIMALS) for (const d of ['front', 'back', 'side']) for (let i = 0; i < 5; i++) T[`walk_${a}_${d}_${i}`] = tex(`${a}_${d}_${i}`);
const walkTex = (a, d, i) => T[`walk_${WALK_ANIMALS.includes(a) ? a : 'rabbit'}_${d}_${i}`];
// 인사 동작 컷(gen_emotes.py): {a}_emo_{bow|fight|rest|stomp}_{front|back}_{A|B}.png, 384² = 걷기 컷 256² 의 1.5배 캔버스. 동물별로 처음 보일 때 미리 불러옴
const EMO_CANVAS = 384 / 256;
const loadEmo = (a) => { if (!WALK_ANIMALS.includes(a) || T[`${a}_emo_bow_front_A`]) return; for (const g of ['bow', 'fight', 'rest', 'stomp']) for (const v of ['front', 'back']) for (const f of 'AB') T[`${a}_emo_${g}_${v}_${f}`] = tex(`${a}_emo_${g}_${v}_${f}`); };
const emoTexOf = (a, g, v, f) => T[`${WALK_ANIMALS.includes(a) ? a : 'rabbit'}_emo_${g}_${v}_${f}`];
loadEmo(ME.animal); loadEmo('rabbit');
const BOT_ANIMAL = 'cat';
const mkSprite = (t, h, opts = {}) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.05, ...opts })); s.scale.set(h, h, 1); s.center.set(0.5, 0); return s; };
// 휴게 코너(11-05): 출입문 오른쪽 자판기·정수기 — 책상처럼 박스·원기둥 조립 + 갈색 윤곽선(산사 벤치마크, 아르곤 1순위). 그룹 앞면 = 로컬 +z → 방 안쪽(-z)을 보게 180° 회전
if (!WORK) {
  const v = new THREE.Group(); v.position.set(5.95, 0, ROOM.d / 2 - 0.42); v.rotation.y = Math.PI; scene.add(v);
  const MINT = 0x9CC5C9, INNER = 0xFFFDF9, DARK = 0x3A261E;
  for (const [x, z] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) cyl(0.035, 0.035, 0.08, DARK, x, 0.04, z, v);   // 다리
  box(0.9, 0.55, 0.7, MINT, 0, 0.355, 0, v);                       // 아래 몸통(배출구 칸)
  box(0.9, 0.22, 0.7, MINT, 0, 1.64, 0, v);                        // 위 몸통
  box(0.94, 0.16, 0.74, C.peach, 0, 1.83, 0.01, v);                // 간판 띠
  box(0.05, 0.98, 0.7, MINT, -0.425, 1.12, 0, v);                  // 왼쪽 기둥
  box(0.25, 0.98, 0.7, MINT, 0.325, 1.12, 0, v);                   // 오른쪽 버튼 기둥
  box(0.6, 0.98, 0.56, INNER, -0.1, 1.12, -0.07, v);               // 진열장 안쪽(앞면에서 14cm 들어감)
  const CAN = [0xF2A6A6, 0xF8E5A6, 0x9CC5A0, 0xDFC19B];
  for (let r = 0; r < 3; r++) {
    const y = 0.72 + r * 0.3;
    box(0.6, 0.025, 0.13, 0xFFFFFF, -0.1, y, 0.26, v);              // 선반
    for (let i = 0; i < 4; i++) {
      const can = cyl(0.045, 0.045, 0.15, CAN[(i + r) % 4], -0.33 + i * 0.15, y + 0.088, 0.26, v);
      can.add(new THREE.LineSegments(new THREE.EdgesGeometry(can.geometry, 30), lineMat.clone()));
      cyl(0.03, 0.045, 0.02, 0xFFFFFF, -0.33 + i * 0.15, y + 0.172, 0.26, v);   // 캔 뚜껑
    }
  }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.98, 0.01), seeThru(C.sky, 0.28)); glass.position.set(-0.1, 1.12, 0.35); v.add(glass);
  glass.add(new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), lineMat.clone()));
  box(0.03, 0.9, 0.012, 0xFFFFFF, -0.3, 1.12, 0.357, v, false);    // 유리 반사 줄
  box(0.15, 0.1, 0.03, 0x2E4F45, 0.325, 1.45, 0.36, v);            // 금액 창
  for (let i = 0; i < 3; i++) box(0.09, 0.06, 0.04, C.peach, 0.325, 1.28 - i * 0.11, 0.365, v);   // 버튼 3개
  box(0.03, 0.1, 0.03, DARK, 0.325, 0.88, 0.36, v);                // 동전 넣는 곳
  box(0.52, 0.16, 0.02, DARK, -0.1, 0.36, 0.355, v);               // 음료 나오는 곳(어두운 구멍)
  box(0.56, 0.03, 0.06, MINT, -0.1, 0.27, 0.37, v);                // 구멍 아래 턱
}
if (!WORK) {
  const w = new THREE.Group(); w.position.set(4.63, 0, ROOM.d / 2 - 0.35); w.rotation.y = Math.PI; scene.add(w);
  box(0.42, 0.82, 0.42, C.part, 0, 0.41, 0, w);                    // 몸통
  box(0.32, 0.26, 0.02, 0xE8D6B8, 0, 0.56, 0.215, w);              // 컵 받는 오목한 칸
  box(0.3, 0.03, 0.08, 0x9CC5C9, 0, 0.44, 0.24, w);                // 물받이
  box(0.05, 0.06, 0.05, 0xFA644F, -0.07, 0.66, 0.245, w); box(0.05, 0.06, 0.05, 0x7EC4E8, 0.07, 0.66, 0.245, w);   // 온수·냉수 손잡이
  box(0.44, 0.04, 0.44, C.woodDark, 0, 0.84, 0, w);                // 윗판
  cyl(0.045, 0.045, 0.06, C.line, 0, 0.89, 0, w);                  // 생수통 목
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.38, 20), seeThru(0xBFE3F0, 0.45)); jug.position.set(0, 1.11, 0); w.add(jug);
  jug.add(new THREE.LineSegments(new THREE.EdgesGeometry(jug.geometry, 30), lineMat.clone()));
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.28, 20), seeThru(0x7EC4E8, 0.55)); water.position.set(0, 1.06, 0); w.add(water);
  cyl(0.04, 0.035, 0.24, 0xFFFFFF, 0.25, 0.6, 0.06, w);            // 종이컵 통
}
// 바닥 접촉 그림자: 가장자리가 흐린 사각 그림자 한 장을 크기만 바꿔 깔아 가구를 바닥에 붙임
const SOFT = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.filter = 'blur(14px)'; x.fillStyle = '#fff'; x.fillRect(24, 24, 80, 80); const t = new THREE.CanvasTexture(cv); return t; })();
const floorShadow = (w, d, x, z, op = 0.18) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, d * 1.6), new THREE.MeshBasicMaterial({ color: 0x5C4033, alphaMap: SOFT, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.007, z); scene.add(m); return m; };
if (!WORK) { floorShadow(0.9, 0.7, 5.95, ROOM.d / 2 - 0.42, 0.24); floorShadow(0.42, 0.42, 4.63, ROOM.d / 2 - 0.35, 0.2); }
for (const s of seats) floorShadow(1.3, 1.0, s.x, s.z + 0.1, 0.14);
if (!WORK) { for (const x of [-5.2, 5.2]) floorShadow(2.6, 0.4, x, -ROOM.d / 2 + 0.3, 0.16); floorShadow(0.9, 0.9, -5.6, -ROOM.d / 2 + 1.3, 0.16); }
const partMask = (m) => { m.userData.mask = { value: new THREE.Vector4() }; m.onBeforeCompile = (sh) => { sh.uniforms.uMask = m.userData.mask; sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vW;\nvoid main() {').replace('gl_Position = projectionMatrix * mvPosition;', 'gl_Position = projectionMatrix * mvPosition; vW = (inverse(viewMatrix) * mvPosition).xyz;'); sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec4 uMask; varying vec3 vW;\nvoid main() {\n  if (uMask.w > 0.5) { vec3 d = vW - cameraPosition; float t = (uMask.x - cameraPosition.x) / d.x; vec3 h = cameraPosition + d * t; if (t > 0.0 && h.y > 0.0 && h.y < 1.05 && h.z > uMask.y && h.z < uMask.z) discard; }'); }; };   // uMask = (partition plane x, z0, z1, on): near partition always covers the in-booth part of the character
const flipCache = new Map();
const flipped = (t) => { let f = flipCache.get(t); if (!f) { f = t.clone(); f.repeat.x = -1; f.offset.x = 1; flipCache.set(t, f); } if (!f.userData.ok && t.image && (t.image.complete ?? true) && t.image.width) { f.image = t.image; f.needsUpdate = true; f.userData.ok = true; } return f; };   // 좌우 반전본(UV 뒤집기)
const shadow = (r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x3A261E, transparent: true, opacity: 0.22 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.008; return m; };

// 착석 타 유저 12명 + 잔상 2명 (정직한 3단계) — 빌보드 하단 38%는 책상 상판(0.7m) 아래로 매립해 2D 책상 그림이 3D 책상과 안 겹치게
const NAME_OF = { cat: '오답냥', frog: '고인물개굴', hamster: '대표햄', bear: '삼수곰', duck: '신입덕', rabbit: '야근토', dog: '공시멍', capybara: '눕바라', quokka: '벼락쿼카', otter: '타이머달' };
const dispNick = (nick, animal) => (!nick || nick === '나' || nick === '손님' ? NAME_OF[animal] || animal : nick);   // '나 · 나' 방지
const seated = [];
const cvTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const PHONE_GLOW = cvTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, '#E0F4FF'); g.addColorStop(0.45, '#7EC4E8'); g.addColorStop(1, 'rgba(126,196,232,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });   // Argon: 폰 화면빛 #E0F4FF→#7EC4E8→투명
const PHONE_BUB = cvTex(208, 176, (x) => { x.fillStyle = '#FFFDF9'; x.strokeStyle = '#3A261E'; x.lineWidth = 8; x.beginPath(); x.roundRect(6, 6, 196, 130, 60); x.moveTo(70, 134); x.lineTo(56, 170); x.lineTo(104, 134); x.fill(); x.stroke(); x.fillStyle = '#FFFDF9'; x.fillRect(64, 124, 44, 14); x.lineWidth = 6; x.fillStyle = '#A4D2E6'; x.beginPath(); x.roundRect(52, 28, 52, 88, 10); x.fill(); x.stroke(); x.fillStyle = '#3A261E'; x.fillRect(68, 102, 20, 5); x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♪', 148, 70); });   // 📱♪ 말풍선
const occupy = (seat, animal, name, kind, state) => {
  const s = mkSprite(T[`${animal}_chair_back`], CHAIR_SZ, kind === 'ghost' ? { opacity: 0.5 } : {}); seat.g.add(s); seat.chairBack.visible = false;   // 엉덩이 = 의자 시트(0.45m), 의자 위치
  const chairCut = true; s.center.set(0.5, CHAIR_CY); s.position.set(0, 0, 0.6); seat.chairBase.visible = false; s.renderOrder = 1; partMask(s.material);   // 의자째 그린 컷: 3D 의자 전체 숨김, 의자 다리 바닥 = 월드 바닥
  seat.occ = { animal, name, kind, state, sprite: s, chairCut }; seat.light?.material.color.setHex(kind === 'ghost' ? DIM : LIT);
  if (kind !== 'ghost') { const glow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0xFFE28A, transparent: true, opacity: 0.75 })); glow.material.depthWrite = false; glow.rotation.x = -Math.PI / 2; glow.position.set(0.3, 0.74, -0.15); glow.userData.fx = true; seat.g.add(glow); seat.occ.lamp = glow; }
  seated.push({ seat, ...seat.occ });
};
const occIdx = [1, 2, 3, 5, 6, 8, 10, 11, 14, 15, 17, 20, 22, 23];
const REAL = !!(Q.get('sb') && Q.get('key'));   // 실제 서버 연결 = 가짜 손님 없이 1번 총무석만 (ui_spec_seatmap_v1 R2: 봇 금지)
const MANAGER = '열람실 총무 삼수곰', MANAGER_UNTIL = 5;   // 실제로 앉은 사람이 5명 미만일 때만 총무가 자리를 지킴 (열람실이 비어 보이지 않게)
if (REAL) occupy(seats[0], 'bear', MANAGER, 'live', 'study');
else occIdx.forEach((i, k) => { const st = seats[i - 1]; const a = WALK_ANIMALS[k % WALK_ANIMALS.length]; const ghost = k >= 12; const nm = NAME_OF[a] + (k >= 10 && !ghost ? '2' : ''); occupy(st, a, ghost ? `${nm} (어제 다녀감)` : (i === 1 ? `총무 ${nm}` : nm), ghost ? 'ghost' : 'live', k % 5 === 4 ? 'sleep' : k % 7 === 3 ? 'phone' : 'study'); });

// 내 캐릭터: 가림 없이 항상 보이게 depthTest 끄고 최상위 렌더
const SPAWN_I = Math.floor(Math.random() * 8);   // 일 모드는 가운데 나무 옆에서 시작(사무실이 가려지지 않게)
const me = { pos: new THREE.Vector3((WORK ? 1.8 : -1.2) + (SPAWN_I % 4) * (WORK ? 0.5 : 0.8), 0, (WORK ? 5.2 : 5.4) + Math.floor(SPAWN_I / 4) * 0.8), dist: 0, moving: false, stopT: -9, sprite: mkSprite(walkTex(ME.animal, 'back', 0), 0.82), sh: shadow(0.2), path: null, pathI: 0, key: 'back', flip: false, keyT: 0, turnT: -9, t0: 0, animal: WALK_ANIMALS.includes(ME.animal) ? ME.animal : 'rabbit', height: 0.82 };
scene.add(me.sprite); scene.add(me.sh);
const BX = WORK ? 2.6 : 0.9;   // 일 모드: 가운데 나무를 피해 걷기
const bot = { pos: new THREE.Vector3(BX, 0, -4), net: new THREE.Vector3(BX, 0, -4), goal: new THREE.Vector3(BX, 0, 6.5), lastSend: 0, dist: 0, moving: true, stopT: -9, sprite: mkSprite(walkTex(BOT_ANIMAL, 'front', 0), 0.82, BOT_ANIMAL === 'rabbit' ? { color: 0xFFD9A0 } : {}), sh: shadow(0.2), prev: new THREE.Vector3(BX, 0, -4), key: 'front', flip: false, keyT: 0, turnT: -9, t0: 0, animal: BOT_ANIMAL, height: 0.82 };
scene.add(bot.sprite); scene.add(bot.sh);

// ---------- 캡슐 라벨(HTML): 나·친구 상시, 타인은 3.5m 안에서만 페이드 ----------
const caps = document.getElementById('caps'); const capOf = new Map();
const cap = (key, text, cls) => { const d = document.createElement('div'); d.className = `cap ${cls}`; d.textContent = text; caps.appendChild(d); capOf.set(key, d); return d; };
cap('me', `🟢 나 · ${dispNick(ME.nick, me.animal)}`, 'me'); cap('bot', '🔥 LIVE · 오답냥', 'live');
if (REAL) { bot.sprite.visible = false; bot.sh.visible = false; capOf.get('bot').style.display = 'none'; }   // 서버 모드: 연결이 실패해도 시연용 봇은 안 보임
seated.forEach((s, i) => cap(`seat${s.seat.no}`, s.name.includes('총무') ? `📋 ${s.name}` : s.kind === 'ghost' ? `🌙 ${s.name}` : s.state === 'sleep' ? `💤 ${s.name} · 조는 중` : s.state === 'phone' ? `📱 ${s.name} · 몰래 폰 보는 중` : `🔥 ${s.name} · ${20 + i * 7}분째 열공`, s.kind === 'ghost' ? 'ghost' : s.state === 'phone' ? 'phone' : 'live'));
const v3 = new THREE.Vector3();
const capQ = [];
const placeCap = (key, x, y, z, alpha = 1) => {
  const d = capOf.get(key); if (!d) return; v3.set(x, y, z).project(camera); const vis = alpha > 0.02 && v3.z < 1 && Math.abs(v3.x) < 1.2;
  if (!vis) { d.style.display = 'none'; return; }
  capQ.push({ d, sx: (v3.x + 1) / 2 * innerWidth, sy: (1 - v3.y) / 2 * innerHeight, depth: v3.z, alpha });
};
const flushCaps = () => {   // 화면 공간 캡슐 겹침 회피(아르곤 통합 검수 3): 가까운 캡슐 우선, 겹치면 뒤 캡슐을 26px 위로, 3회 넘으면 숨김
  capQ.sort((a, b) => a.depth - b.depth); const placed = [];
  if (pin.style.display === 'block') placed.push({ sx: parseFloat(pin.style.left), sy: parseFloat(pin.style.top), w: pin.offsetWidth });   // 길 안내 핀 자리는 비워 둠(뒤 캡슐이 비켜 감)
  for (const c of capQ) {
    c.d.style.display = 'block'; const w = c.d.offsetWidth || 120, h = 26; let tries = 0;
    while (tries < 3 && placed.some((p) => Math.abs(p.sx - c.sx) < (p.w + w) / 2 && Math.abs(p.sy - c.sy) < h)) { c.sy -= 26; tries++; }
    if (tries >= 3) { c.d.style.display = 'none'; continue; }
    c.sx = THREE.MathUtils.clamp(c.sx, w / 2 + 10, innerWidth - w / 2 - 10);   // never clipped at screen edges (Argon r2)
    c.d.style.left = `${c.sx}px`; c.d.style.top = `${c.sy}px`; c.d.style.opacity = c.alpha * (c.d.classList.contains('ghost') ? 0.6 : 1); placed.push({ sx: c.sx, sy: c.sy, w });
  }
  capQ.length = 0;
};

// ---------- 격자 A* (0.25m) : 책상 블록 0.3m 팽창 ----------
const blocks = seats.map((s) => ({ x0: s.x - 0.75, x1: s.x + 0.75, z0: s.z - 0.45, z1: s.z + 0.95 }));
if (WORK) blocks.push(...officeBlocks, ...lounge); else blocks.push({ x0: 4.4, x1: 6.5, z0: ROOM.d / 2 - 0.9, z1: ROOM.d / 2 });   // 일: 사무실 벽·라운지 가구 / 공부: 자판기·정수기
const GW = Math.round(ROOM.w / GRID), GD = Math.round(ROOM.d / GRID);
const cellBlocked = new Uint8Array(GW * GD);
for (let gz = 0; gz < GD; gz++) for (let gx = 0; gx < GW; gx++) {
  const x = -ROOM.w / 2 + (gx + 0.5) * GRID, z = -ROOM.d / 2 + (gz + 0.5) * GRID;
  const nearWall = Math.abs(x) > ROOM.w / 2 - 0.45 || Math.abs(z) > ROOM.d / 2 - 0.7;
  cellBlocked[gz * GW + gx] = nearWall || blocks.some((b) => x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) ? 1 : 0;
}
const toCell = (p) => [Math.max(0, Math.min(GW - 1, Math.floor((p.x + ROOM.w / 2) / GRID))), Math.max(0, Math.min(GD - 1, Math.floor((p.z + ROOM.d / 2) / GRID)))];
const toWorld = (gx, gz) => new THREE.Vector3(-ROOM.w / 2 + (gx + 0.5) * GRID, 0, -ROOM.d / 2 + (gz + 0.5) * GRID);
const nearestFree = (gx, gz) => { for (let r = 0; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const x = gx + dx, z = gz + dz; if (x >= 0 && z >= 0 && x < GW && z < GD && !cellBlocked[z * GW + x]) return [x, z]; } return [gx, gz]; };
const astar = (from, to) => {
  const [sx, sz] = nearestFree(...toCell(from)), [tx, tz] = nearestFree(...toCell(to));
  const key = (x, z) => z * GW + x, open = [[0, sx, sz]], came = new Map(), g = new Map([[key(sx, sz), 0]]);
  const h = (x, z) => Math.hypot(x - tx, z - tz);
  let guard = 0;
  while (open.length && guard++ < 20000) {
    open.sort((a, b) => a[0] - b[0]); const [, x, z] = open.shift(); if (x === tx && z === tz) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GD || cellBlocked[key(nx, nz)]) continue;
      const ng = g.get(key(x, z)) + Math.hypot(dx, dz); if (ng < (g.get(key(nx, nz)) ?? 1e9)) { g.set(key(nx, nz), ng); came.set(key(nx, nz), key(x, z)); open.push([ng + h(nx, nz), nx, nz]); }
    }
  }
  let k = key(tx, tz); if (!came.has(k) && k !== key(sx, sz)) return null;
  const cells = []; while (k !== undefined) { cells.push([k % GW, Math.floor(k / GW)]); k = came.get(k); }
  cells.reverse();
  const pts = cells.map(([x, z]) => toWorld(x, z)); pts[pts.length - 1] = to.clone();   // 끝점은 정확한 목표
  const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1]; if (Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > 1e-6) out.push(b); } out.push(pts[pts.length - 1]);
  return out;
};

// ---------- 바닥 네비 가이드라인: 피치 점선 + 끝 링 ----------
const DASH = 0.28, GAP = 0.18, DASH_N = 120;
const dashGeo = new THREE.CapsuleGeometry(0.08, DASH - 0.16, 3, 10); dashGeo.rotateZ(Math.PI / 2); dashGeo.scale(1, 0.12, 1);   // 납작한 캡슐(길이 0.28, 폭 0.16)
const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: C.peach, transparent: true, opacity: 0.85 }), DASH_N); dashes.count = 0; dashes.frustumCulled = false; scene.add(dashes);
const dashM = new THREE.Matrix4(), dashQ = new THREE.Quaternion(), dashS = new THREE.Vector3(1, 1, 1), dashP = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
let guidePhase = 0;
const layDashes = () => {
  if (!guidePts) { dashes.count = 0; return; }
  let n = 0, carry = guidePhase;                                   // 경로를 따라 DASH+GAP 간격으로 캡슐 배치, phase 로 흐르게
  for (let i = 1; i < guidePts.length && n < DASH_N; i++) {
    const a = guidePts[i - 1], b = guidePts[i], L = a.distanceTo(b), ang = Math.atan2(b.z - a.z, b.x - a.x);
    dashQ.setFromAxisAngle(up, -ang);
    for (let s = carry; s + DASH * 0.5 < L && n < DASH_N; s += DASH + GAP) { dashP.lerpVectors(a, b, (s + DASH / 2) / L).setY(0.03); dashM.compose(dashP, dashQ, dashS); dashes.setMatrixAt(n++, dashM); }
    carry = ((carry - L) % (DASH + GAP) + (DASH + GAP)) % (DASH + GAP);
  }
  dashes.count = n; dashes.instanceMatrix.needsUpdate = true;
};
const destRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: C.peach, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); destRing.rotation.x = -Math.PI / 2; destRing.position.y = 0.025; destRing.visible = false; scene.add(destRing);
const startRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.45, 32), new THREE.MeshBasicMaterial({ color: C.peach, transparent: true, opacity: 0.45, side: THREE.DoubleSide })); startRing.rotation.x = -Math.PI / 2; startRing.position.y = 0.02; startRing.visible = false; scene.add(startRing);
const destRing2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.65, 32), new THREE.MeshBasicMaterial({ color: C.peach, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); destRing2.rotation.x = -Math.PI / 2; destRing2.position.y = 0.025; destRing2.visible = false; scene.add(destRing2);
let guidePts = null; const pin = document.getElementById('pin');
const setGuide = (pts) => {
  guidePts = pts; destRing.visible = destRing2.visible = startRing.visible = !!pts; pin.style.display = pts ? 'block' : 'none';
  if (!pts) { dashes.count = 0; return; }
  destRing2.position.copy(destRing.position).set(pts[pts.length - 1].x, 0.025, pts[pts.length - 1].z);
  layDashes();
  destRing.position.set(pts[pts.length - 1].x, 0.025, pts[pts.length - 1].z);
};
let guideSeat = null;
const goTo = (target, seat = null) => { const pts = astar(me.pos, target); if (!pts) return; guideOff = false; me.path = pts; me.pathI = 1; guideSeat = seat; setGuide(pts); };
// 방향키로 직접 걸을 때: 지나온 선은 지우고 남은 경로만 다시 그림(0.25초마다)
let guideT = 0;
const refreshGuide = (now) => {
  if (!guidePts || me.path || now - guideT < 0.25) return; guideT = now;
  const end = guidePts[guidePts.length - 1]; const pts = astar(me.pos, end); if (pts) { const keep = guideSeat; setGuide(pts); guideSeat = keep; }
};
const guideLen = () => { let L = 0; for (let i = 1; i < guidePts.length; i++) L += guidePts[i].distanceTo(guidePts[i - 1]); return L; };
window.walkTo = (x, z) => goTo(new THREE.Vector3(x, 0, z));
// ---------- 빈자리 추천 칩(👥 칩 탭) + ✕ 안내 끄기 (ui_spec_seatmap_v1 Q2) ----------
const cntEl = document.getElementById('cnt'), brEl = document.getElementById('branch'), pickEl = document.getElementById('pick'), hintEl = document.getElementById('hint');
let people = '', guideOff = false;
const setPeople = (txt) => { people = txt; renderCnt(); };
const renderCnt = () => { const open = pickEl.classList.contains('on'); brEl.innerHTML = `<span class="nm">${people && people !== '⚠' ? `${people} 공부 중` : `🏛️ 찹쌀떡 열람실${people ? ` · ${people}` : ''}`}</span>`; cntEl.textContent = `🪑 빈자리 ${seats.filter((s) => !s.occ && !s.mine).length}석 ${open ? '▴' : '▾'}`; cntEl.classList.toggle('open', open); };   // Argon: 인원은 호점 칩, 우상단은 빈자리
const recSeats = () => {   // 가까운 순으로 카테고리별 1석씩, 중복 없이
  const free = seats.filter((s) => !s.occ && !s.mine).sort((a, b) => a.behind.distanceTo(me.pos) - b.behind.distanceTo(me.pos)), used = new Set();
  const mate = (s) => seats.find((o) => o.occ && o.occ.kind !== 'ghost' && (WORK ? o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 3.9 : o.z === s.z && Math.abs(o.x - s.x) < 2));   // 같은 칸막이 짝(복도 건너편 제외)
  const take = (icon, label, f) => { const s = free.find((x) => !used.has(x) && f(x)); if (!s) return null; used.add(s); return { s, t: `${String(s.no).padStart(2, '0')}번 · ${typeof label === 'function' ? label(s) : label}` }; };   // 컬러 이모지 없이(두들 톤)
  return [take('☀️', '창가석', (s) => (WORK ? s.no <= 7 : s.z === SEAT_Z[0])), take('🧱', '구석 자리', (s) => (WORK ? [1, 7, 8, 14].includes(s.no) : Math.abs(s.x) > 4)), take('🐾', (s) => `${mate(s).occ.name} 옆자리`, mate), !WORK && take('🚪', '복도석', (s) => Math.abs(s.x) < 3)].filter(Boolean);
};
const showPick = (on) => {
  pickEl.classList.toggle('on', on); hintEl.style.visibility = on ? 'hidden' : ''; renderCnt(); if (!on) return; pickEl.replaceChildren();
  const recs = recSeats(); if (!recs.length) { const d = document.createElement('div'); d.className = 'chip'; d.textContent = '지금은 빈자리가 없어요'; pickEl.appendChild(d); }
  for (const { s, t } of recs) { const d = document.createElement('div'); d.className = 'chip'; d.textContent = t; d.onclick = () => { const pts = astar(me.pos, s.behind); if (pts) { guideOff = false; me.path = null; setGuide(pts); guideSeat = s; } showPick(false); }; pickEl.appendChild(d); }   // 길만 깔고 걷기는 방향키로
};
cntEl.addEventListener('click', () => { if (!ME.lock && !seats.some((s) => s.mine)) showPick(!pickEl.classList.contains('on')); });
pin.addEventListener('click', () => { guideOff = true; me.path = null; setGuide(null); });   // 핀 캡슐 끝 ✕ = 안내 끄기
window.goSeat = (no) => { const s = seats[no - 1]; goTo(s.behind, s); };

// ---------- 입력: D-pad / 키보드 / 스와이프 둘러보기 / 바닥·책상 탭 ----------
let camYaw = 0, camDist = CAM.back, camH = CAM.h; const move = { x: 0, y: 0 };
const pad = document.getElementById('pad'), knob = document.getElementById('knob');
const setMove = (x, y) => { if (ME.lock) { x = 0; y = 0; } const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } move.x = x; move.y = y; knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
window.setMove = setMove;
let padId = null; const padC = () => { const r = pad.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); const c = padC(); setMove((e.clientX - c.x) / 30, (e.clientY - c.y) / 30); });
pad.addEventListener('pointermove', (e) => { if (e.pointerId !== padId) return; const c = padC(); setMove((e.clientX - c.x) / 30, (e.clientY - c.y) / 30); });
const padUp = (e) => { if (e.pointerId !== padId) return; padId = null; setMove(0, 0); };
pad.addEventListener('pointerup', padUp); pad.addEventListener('pointercancel', padUp);
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.key); keyMove(); }); addEventListener('keyup', (e) => { keys.delete(e.key); keyMove(); });
const keyMove = () => { const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0), y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0); setMove(x, y); };
let look = null, sitting = null; const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const seatTops = seats.map((s) => s.top);
canvas.addEventListener('pointerdown', (e) => { if (pickEl.classList.contains('on')) { showPick(false); return; }   // 추천 줄 닫는 탭은 이동·둘러보기 없음
  look = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!look || e.pointerId !== look.id) return; const dx = e.clientX - look.x; look.moved += Math.abs(dx); camYaw -= dx * CAM.lookSens; look.x = e.clientX; });
canvas.addEventListener('pointerup', (e) => {
  if (!look || e.pointerId !== look.id) return;
  if (look.moved < 6 && !sitting && !ME.lock) {
    ray.setFromCamera({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
    const hit = ray.intersectObjects(seatTops, false)[0];                       // 책상을 탭하면 그 좌석 뒤까지 네비
    if (hit) { const s = seats[seatTops.indexOf(hit.object)]; goTo(s.behind, s); }
    else { const p = new THREE.Vector3(); if (ray.ray.intersectPlane(floorPlane, p)) goTo(p); }
  }
  look = null;
});

// ---------- 충돌(책상 블록 AABB) ----------
const collide = (p) => {
  p.x = Math.max(-ROOM.w / 2 + 0.4, Math.min(ROOM.w / 2 - 0.4, p.x)); p.z = Math.max(-ROOM.d / 2 + 0.9, Math.min(ROOM.d / 2 - 0.5, p.z));
  for (const b of blocks) { const x0 = b.x0 - COLLIDE_R + 0.2, x1 = b.x1 + COLLIDE_R - 0.2, z0 = b.z0 - COLLIDE_R + 0.2, z1 = b.z1 + COLLIDE_R - 0.2; if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) { const dx = Math.min(p.x - x0, x1 - p.x), dz = Math.min(p.z - z0, z1 - p.z); if (dx < dz) p.x = p.x - x0 < x1 - p.x ? x0 : x1; else p.z = p.z - z0 < z1 - p.z ? z0 : z1; } }
};

// ---------- 보행 연출(공통): 거리 기반 4박자, 발 디딜 때 0.04m 들림, 착지 스쿼시 90ms, 방향 컷 히스테리시스 ----------
const camF = new THREE.Vector3(), camR = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camDirH = new THREE.Vector3();
const walkFrame = (w, dir, now, towardCam = 0) => {
  const ph = (w.dist / STRIDE_CYCLE) % 1;
  let frame = 0; if (w.moving) { const H = MOTION.holds, tot = H[0] + H[1] + H[2] + H[3]; let acc = 0; frame = 4; for (let i = 0; i < 4; i++) { acc += H[i] / tot; if (ph < acc) { frame = i + 1; break; } } }   // 1 접지L · 2 통과 · 3 접지R · 4 통과(홀드 비율)
  const amp = w.moving ? Math.min(1, (now - w.t0) / 0.11) : 0; const a2 = amp * (2 - amp);         // 출발 110ms easeOutQuad 진폭 블렌드
  const phi = ph * Math.PI * 2;
  let bob = a2 * MOTION.bobCm / 100 * Math.abs(Math.sin(phi + MOTION.bobPhase));
  const lean = a2 * (MOTION.rollDeg * Math.PI / 180) * Math.sin(phi);
  let sway = a2 * MOTION.swayCm / 100 * Math.sin(phi);                                               // 좌우 무게 이동(회전 아님, 평행 이동)
  let sy = 1 - a2 * MOTION.sqY * Math.cos(phi * MOTION.sqFreq), sx = 1 + a2 * MOTION.sqX * Math.cos(phi * MOTION.sqFreq);
  if (MOTION.lockSquash) {                                                                               // 프레임 전환에 락: 접지 진입 70ms 0.98/1.02 감쇠, 통과 1.01/0.99 유지
    if (frame !== w.lastFrame) { w.lastFrame = frame; w.frameT = now; }
    if (frame === 1 || frame === 3) { const k = Math.min(1, (now - w.frameT) / 0.07); sy = 1 - 0.015 * (1 - k); sx = 1 + 0.015 * (1 - k); }
    else if (frame === 2 || frame === 4) { sy = 1.008; sx = 0.992; } else { const k = Math.min(1, (now - w.stopT) / 0.08); sy = 1 - 0.025 * (1 - k); sx = 1 + 0.025 * (1 - k); }   // 정지 쿠션 80ms
  }
  const tp = now - w.turnT; const turn = MOTION.turnPop && tp < 0.07 ? (tp < 0.035 ? 1 - 0.14 * (1 - tp / 0.035) : 1 + 0.04 * (1 - (tp - 0.035) / 0.035)) : 1;
  const sq = !w.moving && now - w.stopT < 0.09 ? Math.sin(((now - w.stopT) / 0.09) * Math.PI) * 0.06 : 0;
  camera.getWorldDirection(camDirH); camDirH.y = 0; camDirH.normalize(); const right = tmp2.set(camDirH.z, 0, -camDirH.x);
  const fwd = dir.dot(camDirH), side = dir.dot(right);
  // 히스테리시스: 현재 컷을 유지하다가 반대 성분이 1.25배 넘을 때만 전환(대각선 깜빡임 방지)
  const wantSide = Math.abs(side) > Math.abs(fwd) * (w.key === 'side' ? 0.8 : 1.25);
  const nk = wantSide ? 'side' : fwd >= 0 ? 'back' : 'front';
  if (nk !== w.key && now - w.keyT > 0.10) { w.key = nk; w.keyT = now; w.turnT = now; }
  if (w.key === 'side') w.flip = side > 0;
  // 인사 움직임(11-05): 동작마다 새로 그린 A·B 컷(앞·뒤)을 EMO_SEQ 순서로 넘김. 0 = 서기(걷기 0번 컷)
  let emoTex = null, emoFrame = null;
  if (w.emo && !w.moving) {
    const e = now - w.emo.t0, q = EMO_SEQ[w.emo.k];
    if (e > EMO_DUR) w.emo = null;
    else {
      const t = e % q.rep, f = e < q.rep * q.n ? q.k.find((s) => t < s[0])[1] : q.hold;
      const v = w.key === 'back' ? 'back' : 'front';
      if (f) emoTex = emoTexOf(w.animal, w.emo.k, v, f); else emoFrame = 0;
      if (w.emo.k === 'fight' && f === 'B' && e < q.rep * q.n) bob += 0.12 * Math.sin(Math.PI * Math.min(1, (t - 0.18) / 0.42));   // 만세 때 폴짝
      if (w.emo.k === 'stomp' && f === 'B' && t < 0.26) { sy *= 0.96; sx *= 1.04; }                                              // 쿵 찍는 순간 살짝 눌림
      if (w.key === 'side') w.key = v;
    }
  }
  let texFrame = frame, mirror = false;
  if (MOTION.mirrorFB && w.key !== 'side' && w.animal !== 'duck' && (frame === 3 || frame === 4)) { texFrame = frame - 2; mirror = true; }   // 왼발 컷을 좌우 반전해 오른발 컷으로(완전 대칭)
  const emoting = w.emoteT && now - w.emoteT < 2.0 && !w.moving;
  const flipX = ((w.key === 'side' && w.flip) !== mirror) ? -1 : 1;
  let mp = emoTex ?? (emoting ? T[`${w.animal}_emote_cheer`] : walkTex(w.animal, w.key, emoFrame ?? texFrame)); if (flipX < 0) mp = flipped(mp); w.sprite.material.map = mp; w.sprite.material.rotation = lean;
  const h = w.sprite.scale.y || 0.82; if (MOTION.pivot === 'center') { w.sprite.center.set(0.5, 0.5); } else w.sprite.center.set(0.5, 0);
  const HGT = (w.height ?? 0.82) * (emoTex ? EMO_CANVAS : 1);   // 인사 컷 캔버스는 걷기 컷의 1.5배(같은 1m당 픽셀, 팔 올릴 여유)
  w.sprite.scale.set(HGT * (MOTION.lockSquash ? 1 : 1 + sq) * sx * turn, HGT * (MOTION.lockSquash ? 1 : 1 - sq) * sy * (2 - turn), 1);
  // 타 유저는 카메라 쪽으로 당겨 칸막이 평면과의 교차 잘림 방지
  const CLEAR = 0.01; const yBase = (MOTION.pivot === 'center' ? HGT / 2 : 0) + CLEAR;   // 발끝을 바닥 장식(러그·선) 위 2cm 에, 그림자가 발 밑에
  w.sprite.position.set(w.pos.x - camDirH.x * towardCam + right.x * sway, yBase + bob, w.pos.z - camDirH.z * towardCam + right.z * sway); w.sh.position.set(w.pos.x, 0.008, w.pos.z); w.sh.scale.setScalar(1 - bob * 2.5);
};
const meDir = new THREE.Vector3(0, 0, -1), botDir = new THREE.Vector3(0, 0, 1);

// ---------- 근접 착석 & 전환 ----------
const act = document.getElementById('act'), fade = document.getElementById('fade'), fpv = document.getElementById('fpv');
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: C.peach, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; scene.add(ring);
let nearSeat = null;
const lookAt = new THREE.Vector3();
const checkNear = () => {
  let best = null, bd = NEAR;
  for (const s of seats) { const d = Math.hypot(s.behind.x - me.pos.x, s.behind.z - me.pos.z); if (d < bd) { bd = d; best = s; } }
  nearSeat = best; ring.visible = !!best; if (best) { ring.position.set(best.sit.x, 0.02, best.sit.z); if (!me.moving) meDir.lerp(tmp.set(0, 0, -1), 0.15).normalize(); }
  act.classList.toggle('on', !!best);
  act.classList.toggle('off', !!(RES && best && best !== RES && !best.occ));
  act.classList.toggle('mine', !!(RES && best === RES));
  if (RES && best === RES) act.innerHTML = `<b>🪑 ${best.no}번석 내 자리로</b><small>이어서 공부하기</small>`;
  else if (RES && best && !best.occ) act.innerHTML = `<b>🚫 내 자리는 ${RES.no}번석이에요</b><small>휴식이 끝나면 내 자리로</small>`;
  else if (best) act.innerHTML = best.occ ? (best.occ.kind === 'ghost' ? `<b>🪑 ${best.no}번석 앉기</b><small>어제 누가 쓰던 자리</small>` : `<b>✊ 조용히 응원하기</b><small>${best.occ.name}님에게</small>`) : `<b>🪑 ${best.no}번석 앉아 입실하기</b><small>앱 잠그기</small>`;
};
// 정해진 인사 4종(자유 글 없음): 걸어 다닐 수 있을 때(휴식·입실 전)만. 같은 방 사람에게 방송
// 인사마다 전용 그림(walkFrame 의 emo, EMO_SEQ): 꾸벅 2번 / 만세 폴짝 3번 / 컵 홀짝 2번 / 쿵 발 구르기 3번. 말풍선은 이름표 위에 따로 뜸
const ICON = {
  bow: '<svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.2L18 8.8l-3.5 2.8 1.2 4.4L12 13.6 8.3 16l1.2-4.4L6 8.8l4.4-1.6z" fill="#F8E5A6" stroke="#3A261E" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 19l2-1M20 19l-2-1M12 21v-2" stroke="#3A261E" stroke-width="1.8" stroke-linecap="round"/></svg>',
  fight: '<svg viewBox="0 0 24 24"><path d="M12 2.5c1 3.5 5.5 5 5.5 10.2A5.5 5.5 0 0 1 12 18.2a5.5 5.5 0 0 1-5.5-5.5c0-2.7 1.6-3.9 2.6-5.6.5 1.6 1.4 2.5 2.3 2.8C11 7.8 11 5 12 2.5z" fill="#F49D6E" stroke="#3A261E" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 18.2c-1.6 0-2.6-1.2-2.6-2.6 0-1.6 1.4-2.2 2.6-3.8 1.2 1.6 2.6 2.2 2.6 3.8 0 1.4-1 2.6-2.6 2.6z" fill="#F8E5A6" stroke="#3A261E" stroke-width="1.5"/><path d="M8 21.5h8" stroke="#3A261E" stroke-width="1.8" stroke-linecap="round"/></svg>',
  rest: '<svg viewBox="0 0 24 24"><path d="M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="#E8D6B8" stroke="#3A261E" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 11.5h1.5a2.3 2.3 0 0 1 0 4.6H16" fill="none" stroke="#3A261E" stroke-width="1.8"/><path d="M8.5 7c-1-1.2 1-2 0-3.5M12.5 7c-1-1.2 1-2 0-3.5" fill="none" stroke="#3A261E" stroke-width="1.6" stroke-linecap="round"/></svg>',
  stomp: '<svg viewBox="0 0 24 24"><path d="M3 9.5c3-2 15-2 18 0l-.6 3.4c-3.2-1.7-13.6-1.7-16.8 0z" fill="#F2A6A6" stroke="#3A261E" stroke-width="1.8" stroke-linejoin="round"/><path d="M19.8 11.5l2 4.5M19 12l.4 5" stroke="#3A261E" stroke-width="1.8" stroke-linecap="round"/><path d="M9 14.5v3.2M12 14.5v4.5M15 14.5v3.2" stroke="#3A261E" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const EMOTES = [
  { k: 'bow', t: '꾸벅 인사', fx: '✦ ✦' }, { k: 'fight', t: '같이 파이팅!', fx: '★ ★ ★' },
  { k: 'rest', t: '잠깐 숨 돌리는 중', fx: '~ ~' }, { k: 'stomp', t: '오늘 끝까지 간다', fx: '! !' },
];
const EMO_DUR = 2.2;
// 동작 순서: rep 초 한 바퀴를 n 번, k = [끝나는 시각, 컷] (0 = 서기), 끝나면 hold 컷으로 멈춤. 준비 A 는 짧게, 정점 B 는 길게(아르곤 3:7)
const EMO_SEQ = {
  bow: { rep: 0.9, n: 2, k: [[0.2, 'A'], [0.7, 'B'], [0.9, 'A']], hold: 0 },        // 꾸벅 2번
  fight: { rep: 0.6, n: 3, k: [[0.18, 'A'], [0.6, 'B']], hold: 'B' },              // 움츠렸다 만세 폴짝 3번
  rest: { rep: 1.1, n: 2, k: [[0.35, 'A'], [1.1, 'B']], hold: 'A' },               // 컵 들고 → 홀짝 2번
  stomp: { rep: 0.55, n: 3, k: [[0.2, 'A'], [0.55, 'B']], hold: 'B' },             // 발 들었다 쿵 3번, 마지막 B 로 멈춤
};
const bubbles = new Map();   // 대상 키 → { el, until, pos() }
const bubbleLayer = document.getElementById('bubbles');
const showBubble = (key, e, pos) => {
  let b = bubbles.get(key);
  if (!b) { const el = document.createElement('div'); el.className = 'bubble'; bubbleLayer.appendChild(el); b = { el }; bubbles.set(key, b); }
  b.el.innerHTML = `<i>${ICON[e.k]}</i><span></span><em class="fx fx-${e.k}"></em>`; b.el.querySelector('span').textContent = e.t; b.el.querySelector('em').textContent = e.fx;
  b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop');   // 탄성 팝업 다시 재생
  b.until = performance.now() / 1000 + 3.6; b.pos = pos;
};
const placeBubbles = (now) => {
  pin.style.opacity = bubbles.has('me') ? '0.25' : '';   // 내 인사 말풍선이 떠 있는 동안 길 안내 핀은 흐리게
  for (const [key, b] of bubbles) {
    if (now > b.until) { b.el.remove(); bubbles.delete(key); continue; }
    const p = b.pos(); v3.set(p.x, 1.62, p.z).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.2; b.el.style.display = vis ? '' : 'none';
    if (vis) { b.el.style.left = `${(v3.x + 1) / 2 * innerWidth}px`; b.el.style.top = `${(1 - v3.y) / 2 * innerHeight}px`; b.el.style.opacity = now > b.until - 0.4 ? String((b.until - now) / 0.4) : '1'; }
  }
};
let lastEmote = 0;
const emote = (i) => { const now = performance.now() / 1000; if (now - lastEmote < 3) return; lastEmote = now; me.emo = { k: EMOTES[i].k, t0: now }; showBubble('me', EMOTES[i], () => me.pos); rt.broadcast('emote', { i }); };
const cheer = () => { me.emoteT = performance.now() / 1000; send('CHEER', { name: nearSeat.occ.name }); rt.broadcast('cheer', { seat: nearSeat.no }); const d = capOf.get(`seat${nearSeat.no}`); if (d) { const prev = d.textContent; d.textContent = `✊ ${nearSeat.occ.name}님에게 응원을 보냈어요!`; setTimeout(() => (d.textContent = prev), 2000); } };
const sitDown = () => {
  if (nearSeat?.occ?.kind === 'live') return cheer();
  if (!nearSeat || sitting) return;
  if (RES && nearSeat !== RES) return;   // 휴식 중엔 내 자리로만 복귀
  const s = nearSeat; sitting = { t0: performance.now(), s, from: camera.position.clone(), fromLook: lookAt.clone() };
  act.classList.remove('on'); ring.visible = false; setMove(0, 0); me.path = null; setGuide(null);
};
act.addEventListener('click', () => (ME.lock ? send('BACK') : sitDown())); window.sitDown = sitDown;
const emoBtn = document.getElementById('emo'), emoPick = document.getElementById('emoPick');
if (!ME.lock) emoBtn.style.display = 'flex';   // 입실 중(관전)에는 말풍선 없음
EMOTES.forEach((e, i) => { const c = document.createElement('div'); c.className = 'emoCell'; c.innerHTML = `<i>${ICON[e.k]}</i><span></span>`; c.querySelector('span').textContent = e.t; c.addEventListener('click', () => { emoPick.style.display = 'none'; emote(i); }); emoPick.appendChild(c); });
emoBtn.addEventListener('click', () => { emoPick.style.display = emoPick.style.display === 'grid' ? 'none' : 'grid'; });
document.getElementById('back').addEventListener('click', () => send('BACK'));

// ---------- Supabase Realtime: Presence(상태·좌석) + Broadcast(좌표 8Hz) ----------
const remotes = new Map();   // uid → { walker, capKey, seat }
const vacate = (seat) => { if (!seat.occ) return; seat.light?.material.color.setHex(DIM); seat.g.remove(seat.occ.sprite); const e0 = seated.find((s) => s.seat === seat); for (const o of [seat.occ.lamp, ...(e0?.fx || [])]) if (o) seat.g.remove(o); seat.chairBack.visible = true; seat.chairBase.visible = true; for (const o of seat.desk) o.traverse((q) => { q.userData.noDW = false; }); const i = seated.findIndex((s) => s.seat === seat); if (i >= 0) seated.splice(i, 1); capOf.get(`seat${seat.no}`)?.remove(); capOf.delete(`seat${seat.no}`); seat.occ = null; };
const mkRemote = (uid, p) => {
  const a = WALK_ANIMALS.includes(p.animal) ? p.animal : 'rabbit';
  loadEmo(a); const w = { pos: new THREE.Vector3(p.x ?? 0, 0, p.z ?? 7), recv: null, prev: new THREE.Vector3(), dist: 0, moving: false, stopT: -9, sprite: mkSprite(walkTex(a, 'front', 0), 0.82), sh: shadow(0.2), key: 'front', flip: false, keyT: 0, turnT: -9, t0: 0, animal: a, dir: new THREE.Vector3(0, 0, 1), lastRecv: 0 };
  scene.add(w.sprite); scene.add(w.sh); const capKey = `r_${uid}`; cap(capKey, `🚶 ${dispNick(p.nick, a)} · 둘러보는 중`, '');
  return { walker: w, capKey, seat: 0, nick: dispNick(p.nick, a), animal: a };
};
const applyPresence = (state) => {
  const seen = new Set();
  for (const [uid, metas] of Object.entries(state)) {
    if (uid === ME.uid) continue; const p = metas[metas.length - 1]; if (!p) continue; seen.add(uid);
    let r = remotes.get(uid); if (!r) { r = mkRemote(uid, p); remotes.set(uid, r); }
    const seatNo = Number(p.seat || 0);
    if (seatNo && r.seat !== seatNo) { if (r.seat) vacate(seats[r.seat - 1]); const st = seats[seatNo - 1]; if (st) { vacate(st); occupy(st, r.animal, r.nick, 'live', p.state === 'sleep' ? 'sleep' : p.state === 'phone' ? 'phone' : 'study'); cap(`seat${seatNo}`, `🔥 ${r.nick} · ${p.goal || '열공'}`, 'live'); } r.seat = seatNo; r.walker.sprite.visible = false; r.walker.sh.visible = false; capOf.get(r.capKey).style.display = 'none'; }
    if (!seatNo && r.seat) { vacate(seats[r.seat - 1]); r.seat = 0; r.walker.sprite.visible = true; r.walker.sh.visible = true; capOf.get(r.capKey).style.display = ''; }
    const stt = p.state === 'sleep' ? 'sleep' : p.state === 'phone' ? 'phone' : 'study';   // 같은 좌석에서 상태만 바뀐 경우(휴식·딴짓)
    if (seatNo && r.seat === seatNo && r.state !== stt) { const st = seats[seatNo - 1]; if (st?.occ) { st.occ.state = stt; const e = seated.find((x) => x.seat === st); if (e) e.state = stt; const d = capOf.get(`seat${seatNo}`); if (d) { d.className = `cap ${stt === 'phone' ? 'phone' : 'live'}`; d.textContent = stt === 'sleep' ? `💤 ${r.nick} · 조는 중` : stt === 'phone' ? `📱 ${r.nick} · 몰래 폰 보는 중` : `🔥 ${r.nick} · ${p.goal || '열공'}`; }; } }
    r.state = stt;
    if (!seatNo && p.x != null && !r.walker.recv) r.walker.pos.set(p.x, 0, p.z);
  }
  for (const [uid, r] of remotes) if (!seen.has(uid)) { if (r.seat) vacate(seats[r.seat - 1]); scene.remove(r.walker.sprite); scene.remove(r.walker.sh); capOf.get(r.capKey)?.remove(); capOf.delete(r.capKey); remotes.delete(uid); }
  setPeople(`${1 + remotes.size}명`);
  const sitting = [...remotes.values()].filter((r) => r.seat).length + (ME.seat ? 1 : 0), st = seats[0];
  if (sitting < MANAGER_UNTIL && !st.occ) { occupy(st, 'bear', MANAGER, 'live', 'study'); cap('seat1', `📋 ${MANAGER}`, 'live'); }
  else if (sitting >= MANAGER_UNTIL && st.occ?.name === MANAGER) vacate(st);
};
const rt = { ok: false, lastPos: 0, track() {}, broadcast() {} };
const SB_URL = Q.get('sb'), SB_KEY = Q.get('key');
if (SB_URL && SB_KEY) {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const chan = sb.channel(`room:${ME.ch}`, { config: { presence: { key: ME.uid }, broadcast: { self: false } } });
    let mine = { nick: ME.nick, animal: ME.animal, state: ME.lock ? 'study' : 'walk', seat: ME.seat, x: me.pos.x, z: me.pos.z };
    rt.track = (patch) => { mine = { ...mine, ...patch }; if (ME.lock || ME.seat) return; chan.track(mine).catch(() => {}); };   // lock(입실 중)이면 앱이 Presence 를 유지
    rt.broadcast = (event, payload) => chan.send({ type: 'broadcast', event, payload: { u: ME.uid, ...payload } });
    chan.on('presence', { event: 'sync' }, () => applyPresence(chan.presenceState()));
    chan.on('broadcast', { event: 'pos' }, ({ payload }) => { const r = remotes.get(payload.u); if (!r || r.seat) return; r.walker.recv = new THREE.Vector3(payload.x, 0, payload.z); r.walker.lastRecv = performance.now() / 1000; });
    chan.on('broadcast', { event: 'emote' }, ({ payload }) => { const r = remotes.get(payload.u); const e = EMOTES[payload.i]; if (!r || !e || r.seat) return; r.walker.emo = { k: e.k, t0: performance.now() / 1000 }; showBubble(r.capKey, e, () => r.walker.pos); });
    chan.on('broadcast', { event: 'cheer' }, ({ payload }) => { if (payload.seat === ME.seat && ME.seat) { const d = capOf.get('me'); document.getElementById('hint').textContent = `✊ 누군가 조용히 응원을 보냈어요!`; setTimeout(() => { document.getElementById('hint').textContent = ME.lock ? `🔒 ${ME.seat}번석에서 집중하고 있어요` : '방향키로 걷기 · 쓸어 둘러보기 · 책상을 탭하면 길 안내'; }, 3000); } });
    chan.subscribe((status) => { if (status === 'SUBSCRIBED') { rt.ok = true; rt.track({}); } });
    // 실시간이면 데모용 봇·착석자 제거(총무 1번만 유지)
    bot.sprite.visible = false; bot.sh.visible = false; capOf.get('bot').style.display = 'none';
    for (const s of [...seated]) if (s.seat.no !== 1) vacate(s.seat);
    window.rt = rt; window.remotes = remotes;
  } catch (e) { console.warn('realtime off', e); setPeople('⚠'); }
} else setPeople('');

// ---------- 루프 ----------
let last = performance.now() / 1000, frames = 0, fpsT = last; window.fps = 0;
const loop = () => {
  const now = performance.now() / 1000, dt = Math.min(0.05, now - last); last = now; frames++; if (now - fpsT > 1) { window.fps = frames; frames = 0; fpsT = now; renderCnt(); }
  camF.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)); camR.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  let mv = tmp.set(0, 0, 0), mag = 0;
  if (!sitting) {
    if (move.x || move.y) { mv.addScaledVector(camF, -move.y).addScaledVector(camR, move.x); mag = Math.min(1, Math.hypot(move.x, move.y)); me.path = null; }   // 방향키는 자동 보행을 끊음(가이드는 유지)
    else if (me.path) {
      const wp = me.path[me.pathI]; mv.subVectors(wp, me.pos); const d = mv.length();
      if (d < 0.12) { me.pathI++; if (me.pathI >= me.path.length) { me.path = null; setGuide(null); } mv.set(0, 0, 0); }
      else mag = me.pathI === me.path.length - 1 ? Math.min(1, d / 0.5 + 0.35) : 1;
    }
    if (destRing.visible && Math.hypot(destRing.position.x - me.pos.x, destRing.position.z - me.pos.z) < 0.6) { setGuide(null); me.path = null; }   // 도착 시 가이드 종료
  }
  if (mag > 0 && mv.lengthSq() > 0) {
    mv.normalize(); const step = SPEED * Math.max(0.36, mag) * dt; me.pos.addScaledVector(mv, step); collide(me.pos); me.dist += step; if (!me.moving) me.t0 = now; me.moving = true;
    if (meDir.dot(mv) < -0.2) meDir.copy(mv); else meDir.lerp(mv, Math.min(1, dt / 0.15)).normalize();   // 반대 방향 전환은 즉시(0 을 지나며 정규화되면 튕김)
  } else if (me.moving) { me.moving = false; me.stopT = now; }
  // 봇: 서버는 자기 속도로 이동, 8Hz 로만 좌표 전송 → 수신 측 lerp 0.18
  const bd = tmp.subVectors(bot.goal, bot.net); if (bd.length() < 0.1) { bot.goal.z = bot.goal.z > 0 ? -6 : 6.5; } else { bd.normalize(); bot.net.addScaledVector(bd, SPEED * 0.8 * dt); }
  if (now - bot.lastSend > 1 / NET_HZ) { bot.lastSend = now; bot.recv = bot.net.clone(); }
  if (bot.recv) { bot.prev.copy(bot.pos); bot.pos.lerp(bot.recv, 1 - Math.exp(-dt * 11)); const moved = bot.pos.distanceTo(bot.prev); bot.dist += moved; const was = bot.moving; bot.moving = moved > 0.0015; if (was && !bot.moving) bot.stopT = now; if (!was && bot.moving) bot.t0 = now; if (bot.moving) botDir.subVectors(bot.pos, bot.prev).normalize(); }

  // 카메라: 체이스 캠(책상 블록이 끼면 위로) / 착석 돌리인. lookAt 은 내 캐릭터 기준 고정 → 거리와 무관하게 캐릭터가 같은 화면 위치
  if (sitting) {
    const k = Math.min(1, (performance.now() - sitting.t0) / 450), e = 1 - Math.pow(1 - k, 3);
    const to = new THREE.Vector3(sitting.s.sit.x, 1.1, sitting.s.sit.z + 0.1), toLook = new THREE.Vector3(sitting.s.sit.x, 0.95, sitting.s.sit.z - 1.2);
    camera.position.lerpVectors(sitting.from, to, e); camera.lookAt(lookAt.lerpVectors(sitting.fromLook, toLook, e));
    me.sprite.visible = k < 0.55; me.sh.visible = me.sprite.visible;
    if (k >= 1 && !sitting.done) { sitting.done = true; fpv.querySelector('.msg').textContent = `🟢 ${String(sitting.s.no).padStart(2, '0')}번석 입실 · 앱이 잠겼어요`; fade.style.opacity = 1; setTimeout(() => { fpv.style.opacity = 1; }, 150); window.sat = true; send('SIT', { seat: sitting.s.no }); rt.track({ state: 'study', seat: sitting.s.no }); }
  } else {
    const kD = 1 - Math.exp(-dt * 12), kH = 1 - Math.exp(-dt * 7); camDist += (CAM.back - camDist) * kD; camH += (CAM.h - camH) * kH;   // 가구는 당기지 않고 사이에 낀 가구만 반투명(아르곤 통합 검수 2)
    camera.position.copy(me.pos).addScaledVector(camF, -camDist).setY(camH);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -ROOM.w / 2 + 0.3, ROOM.w / 2 - 0.3); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -ROOM.d / 2 + 0.3, ROOM.d / 2 - 0.3);
    camera.lookAt(lookAt.copy(me.pos).addScaledVector(camF, CAM.lookAhead).setY(CAM.lookH));
  }
  if (rt.ok && me.moving && now - rt.lastPos > 1 / NET_HZ) { rt.lastPos = now; rt.broadcast('pos', { x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2) }); }
  if (rt.ok && !me.moving && me.wasMoving) rt.track({ x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2) }); me.wasMoving = me.moving;
  for (const r of remotes.values()) { const w = r.walker; if (r.seat) continue; if (w.recv) { w.prev.copy(w.pos); w.pos.lerp(w.recv, 1 - Math.exp(-dt * 11)); const mv2 = w.pos.distanceTo(w.prev); w.dist += mv2; const was = w.moving; w.moving = mv2 > 0.0015 && now - w.lastRecv < 0.4; if (was && !w.moving) w.stopT = now; if (!was && w.moving) w.t0 = now; if (w.moving) w.dir.subVectors(w.pos, w.prev).normalize(); } walkFrame(w, w.dir, now, 0.3); placeCap(r.capKey, w.pos.x, 1.2, w.pos.z, THREE.MathUtils.clamp(LABEL_R + 1 - w.pos.distanceTo(me.pos), 0, 1)); }
  walkFrame(me, meDir, now, 0); walkFrame(bot, botDir, now, 0.3);
  if (window.camOverride) { const o = window.camOverride; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.lx, o.ly, o.lz); }   // angle-capture camera pin
  for (const s of seated) {
    {   // 의자 일체형: 좌석 뒤(+z) 기준 카메라 방위각으로 8(또는 4)방향 컷 선택
      const cx = camera.position.x - s.seat.x, cz = camera.position.z - (s.seat.z + 0.6), cd = Math.hypot(cx, cz), ang = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(cx, cz)));
      const pick = (g) => (DIRS === 8 ? (g < 22 ? 'chair_back' : g < 68 ? 'chair_back34' : g < 125 ? 'chair_side' : 'chair_front') : (g < 45 ? 'chair_back' : g < 125 ? 'chair_side' : 'chair_front'));   // Argon: 0-22 / 22-68 / 68-125 / 125-180
      const cur = s.baseKey; let key = (cur && (pick(ang - 6) === cur || pick(ang + 6) === cur)) ? cur : pick(ang); s.baseKey = key;   // ±6° hysteresis, instant swap (no crossfade)
      if (s.state === 'sleep' && (key === 'chair_back' || key === 'chair_back34')) key = 'chair_sleep_back';
      const flip = cx < 0 && (key === 'chair_back34' || key === 'chair_side'); const tx = T[`${s.animal}_${key}`];
      s.sprite.material.map = flip ? flipped(tx) : tx; s.sprite.position.set(cx / (cd || 1) * 0.1, 0, 0.6 + cz / (cd || 1) * 0.1);   // 카메라 쪽 10cm: 책상 모서리와의 교차 방지
      s.seat.chairBack.visible = false; s.key = key;
      const back = key !== 'chair_front'; for (const o of s.seat.desk) o.traverse((q) => { q.userData.noDW = back; });   // 뒤·옆에서는 내 책상이 캐릭터를 자르지 않음(손이 책상 위)
      const side = Math.abs(cx) > 0.72 ? Math.sign(cx) : 0, pp = side > 0 ? s.seat.pR : s.seat.pL;
      s.sprite.material.userData.mask.value.set(s.seat.x + side * 0.71, s.seat.z - 0.4, s.seat.z + 0.5, !WORK && side && pp.material.opacity > 0.9 ? 1 : 0);
      const near = THREE.MathUtils.clamp((Math.hypot(camera.position.x - s.seat.x, camera.position.z - s.seat.z) - 1.0) / 0.8, 0, 1);
      s.sprite.material.opacity = (s.kind === 'ghost' ? 0.5 : 1) * near; s.nearAlpha = near;
      const ph = s.state === 'phone' && s.kind !== 'ghost';   // Argon C안: 푸른 화면빛 깜빡임 + 📱♪ 말풍선 둥실 + 1.8% 톡톡, 스탠드빛 0.2
      if (ph && !s.fx) { s.fx = [mkSprite(PHONE_GLOW, 0.62, { depthWrite: false, alphaTest: 0 }), mkSprite(PHONE_BUB, 0.26, { depthWrite: false })]; s.fx[0].center.set(0.5, 0.5); s.fx[0].position.set(0, 0.82, 0.34); s.fx[1].scale.set(0.26, 0.22, 1); s.fx[1].renderOrder = 2; for (const f of s.fx) { f.userData.fx = true; s.seat.g.add(f); } }
      if (s.fx) for (const f of s.fx) f.visible = ph;
      if (s.lamp) s.lamp.material.opacity = ph ? 0.2 : 1;
      s.sprite.scale.y = CHAIR_SZ * (ph ? 1 - Math.abs(Math.sin(now * 5.6)) * 0.018 : 1);
      if (ph) { s.fx[0].material.opacity = (0.55 + 0.2 * Math.sin(now * 4.5) + 0.08 * Math.sin(now * 11.3)) * near; s.fx[1].position.set(0.26, 1.02 + Math.sin(now * 3.5) * 0.025, 0.45); s.fx[1].material.opacity = near; }
    }
  }
  if (!sitting && !ME.lock) { checkNear(); refreshGuide(now); }
  if (RES && !sitting) { const dR = Math.hypot(RES.behind.x - me.pos.x, RES.behind.z - me.pos.z); if (dR > 1.5 && !guidePts && !me.path && !guideOff) { const pts = astar(me.pos, RES.behind); if (pts) { setGuide(pts); guideSeat = RES; } } else if (dR < NEAR && guidePts && guideSeat === RES) setGuide(null); }
  // 카메라→내 캐릭터 사이를 가리는 칸막이만 0.32 로 반투명
  const kO = 1 - Math.exp(-dt * 12);
  for (const s of seats) s.g.traverse((o) => { if ((o.isMesh || o.isLineSegments) && !o.userData.fx) { o.material.opacity += (1 - o.material.opacity) * kO; o.material.depthWrite = !o.userData.noDW; } });
  ray.set(camera.position, tmp.copy(me.pos).setY(0.5).sub(camera.position).normalize());
  const occl = ray.intersectObjects(partParts, false); const dMe = camera.position.distanceTo(tmp.copy(me.pos).setY(0.5));
  const dim = new Set(); for (const h of occl) if (h.distance < dMe) dim.add(seats.find((s) => s.g === h.object.parent));
  for (const s of dim) if (s) { const hide = Math.hypot(camera.position.x - s.x, camera.position.z - s.z) < 1.6; s.g.traverse((o) => { if (o.userData.fx) return; if (o.isMesh || o.isLineSegments) o.material.depthWrite = false; if (hide && (o.isMesh || o.isLineSegments)) { o.material.opacity = 0; return; } if (o.isLineSegments) o.material.opacity = 0.12; else if (o.isMesh) o.material.opacity = 0.22; else if (o.isSprite) o.material.opacity *= 0.25; }); }   // camera-near (<1.6m) occluder fully hidden (Argon)
  if (guidePts) { const e = guidePts[guidePts.length - 1]; v3.set(e.x, 1.35, e.z).project(camera); const vis = v3.z < 1; pin.style.display = vis ? 'block' : 'none'; if (vis) { const hw = pin.offsetWidth / 2 + 12; pin.style.left = `${THREE.MathUtils.clamp((v3.x + 1) / 2 * innerWidth, hw, innerWidth - hw)}px`; pin.style.top = `${(1 - v3.y) / 2 * innerHeight}px`; pin.textContent = `📍 ${guideSeat ? (RES && guideSeat === RES ? `내 자리(${guideSeat.no}번석)` : guideSeat.no + '번 빈자리') : '여기'} · ${guideLen().toFixed(1)}m 남음  ✕`; } startRing.position.set(me.pos.x, 0.02, me.pos.z); guidePhase = (guidePhase - dt * 0.6) % (DASH + GAP); if (guidePhase < 0) guidePhase += DASH + GAP; layDashes(); }
  placeBubbles(now);
  placeCap('me', me.pos.x, 1.2, me.pos.z); if (bot.sprite.visible) placeCap('bot', bot.pos.x, 1.2, bot.pos.z, THREE.MathUtils.clamp(LABEL_R + 1 - bot.pos.distanceTo(me.pos), 0, 1));   // 서버 모드엔 봇을 숨기는데 이름표만 떠다니던 문제
  if (RES) { if (guidePts && guideSeat === RES) capOf.get('res').style.display = 'none'; else placeCap('res', RES.x, 1.25, RES.z + 0.42); }   // guide pin active -> hide the seat capsule (Argon r2)
  seated.forEach((s) => placeCap(`seat${s.seat.no}`, s.seat.x, 1.25, s.seat.z + 0.42, (s.nearAlpha ?? 1) * THREE.MathUtils.clamp(LABEL_R + 1 - Math.hypot(s.seat.x - me.pos.x, s.seat.z + 0.42 - me.pos.z), 0, 1)));
  if (sitting) { const d = capOf.get('me'); if (d) d.style.display = 'none'; }
  flushCaps();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
};
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();
// 입장 시: 가장 가까운 빈자리로 기본 가이드(헤매는 시간 0초)
const RES = (!ME.lock && ME.seat && seats[ME.seat - 1]) || null;   // 휴식·외출 중: 내 좌석 예약(복귀만 가능)
if (RES) RES.mine = true;   // 빈자리 수·추천에서 제외
const firstFree = seats.filter((s) => !s.occ && s.behind.z < me.pos.z - 1).sort((a, b) => a.behind.distanceTo(me.pos) - b.behind.distanceTo(me.pos))[0];
if (firstFree && !ME.lock && !RES) { const pts = astar(me.pos, firstFree.behind); if (pts) { guideSeat = firstFree; setGuide(pts); } }   // 자동 보행은 안 함(방향키로 직접)
if (RES) {
  vacate(RES); const glow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0xFFE28A, transparent: true, opacity: 0.75 })); glow.material.depthWrite = false; glow.rotation.x = -Math.PI / 2; glow.position.set(0.3, 0.74, -0.15); RES.g.add(glow);
  cap('res', `📌 내 자리 (${RES.no}번석 · 휴식 중)`, 'res');   // 분신(걷는 나 + 앉은 나) 방지: 캐릭터 없이 '비운 내 자리' 표시
  me.pos.copy(RES.behind); camYaw = 0;
  document.getElementById('hint').textContent = `☕ 휴식 중 · ${RES.no}번석(내 자리)에 다시 앉으면 공부가 이어져요`;
}
if (ME.lock) {
  const pad2 = (n) => String(n).padStart(2, '0');
  document.getElementById('hint').textContent = ME.seat ? `🔒 현재 ${pad2(ME.seat)}번석에서 집중 중이에요 (자리 이동은 휴식 때만 돼요)` : '🔒 집중 중이에요 (자리 이동은 휴식 때만 돼요)';
  document.getElementById('pad').style.display = 'none'; me.sprite.visible = false; me.sh.visible = false; capOf.get('me').remove(); capOf.delete('me');
  const mySeat = seats[ME.seat - 1];
  if (mySeat) { vacate(mySeat); occupy(mySeat, me.animal, dispNick(ME.nick, me.animal), 'me', 'study'); cap(`seat${mySeat.no}`, `🟢 나 · ${dispNick(ME.nick, me.animal)}`, 'me'); me.pos.copy(mySeat.behind); camYaw = 0; CAM.back = 2.2; CAM.h = 2.3; CAM.lookH = 0.7; camDist = 2.2; camH = 2.3; }   // 2.3m: 뒷줄 칸막이(1.05m)·착석자 위로 넘겨 봐서 사이에 낀 가구 페이드 덩어리가 안 생김
  act.innerHTML = '<b>📖 내 책상 화면으로 돌아가기</b>'; act.classList.add('on', 'lock');
}
window.me = me; window.seats = seats; window.seated = seated; window.camera = camera; window.scene = scene; window.T = T; window.ready = true;
window.dbg = () => ({ meDir: meDir.toArray().map((v) => +v.toFixed(2)), camDirH: camDirH.toArray().map((v) => +v.toFixed(2)), key: me.key, keyT: me.keyT });
requestAnimationFrame(loop);

// 일 모드 문구: 화면 글자를 공부 말 → 일하는 말로 (src/copy.ts 규칙 중 3D 방에 나오는 것만). 바꾼 뒤엔 더 바꿀 게 없어 다시 돌지 않음
if (WORK) {
  const RULES = [['🏛️', '🏢'], [/빈자리 (\d+)석/g, '빈 방 $1개'], [/(\d)번 빈자리/g, '$1호 빈 방'], ['빈자리', '빈 방'], ['창가석', '창가 방'], ['복도석', '복도 쪽 방'], ['구석 자리', '구석 방'], ['옆자리', '옆방'], ['열람실 총무', '공유오피스 매니저'], ['열람실', '공유오피스'], [/(\d)번석 내 자리로/g, '$1호 내 방으로'], [/(\d)번석 앉아 입실하기/g, '$1호로 출근하기'], [/(\d)번석\(내 자리\)에 다시 앉으면/g, '$1호(내 방)로 돌아오면'], ['입실 중', '근무 중'], ['입실', '출근'], ['퇴실', '퇴근'], [/(\d)번석/g, '$1호'], ['번석', '호'], ['공부 중', '일하는 중'], ['공부가', '일이'], ['공부하기', '일하기'], ['공부', '일']];
  const fix = (t) => RULES.reduce((a, [x, y]) => (typeof x === 'string' ? a.split(x).join(y) : a.replace(x, y)), t);
  const walk = (n) => { if (n.nodeType === 3) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else n.childNodes.forEach(walk); };
  walk(document.body); document.title = fix(document.title);
  new MutationObserver((ms) => ms.forEach((m) => (m.type === 'characterData' ? walk(m.target) : m.addedNodes.forEach(walk)))).observe(document.body, { subtree: true, childList: true, characterData: true });
}
