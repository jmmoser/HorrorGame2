// Ceiling fixtures are lit by a small fixed pool of custom lights injected into
// three's lighting chunk. Each one is clipped to the room it hangs in, so light
// never leaks through walls and walls are lit properly without shadow maps.
import * as THREE from '../vendor/three.module.min.js';

export const ROOM_LIGHTS = 5;
const arr = (make) => Array.from({ length: ROOM_LIGHTS }, make);

export const roomU = {
  rlPosV: { value: arr(() => new THREE.Vector3()) },
  rlPosW: { value: arr(() => new THREE.Vector3(0, -100, 0)) },
  rlColor: { value: arr(() => new THREE.Vector3()) },
  rlRect: { value: arr(() => new THREE.Vector4()) },
  rlRange: { value: new Float32Array(ROOM_LIGHTS).fill(1) },
  rlCamWorld: { value: new THREE.Matrix4() },
};

THREE.ShaderChunk.lights_pars_begin += /* glsl */`
uniform vec3 rlPosV[ ${ROOM_LIGHTS} ];
uniform vec3 rlPosW[ ${ROOM_LIGHTS} ];
uniform vec3 rlColor[ ${ROOM_LIGHTS} ];
uniform vec4 rlRect[ ${ROOM_LIGHTS} ];
uniform float rlRange[ ${ROOM_LIGHTS} ];
uniform mat4 rlCamWorld;
`;

THREE.ShaderChunk.lights_fragment_begin += /* glsl */`
#if defined( RE_Direct )
{
  vec3 rlWP = ( rlCamWorld * vec4( geometryPosition, 1.0 ) ).xyz;
  IncidentLight rl;
  for ( int i = 0; i < ${ROOM_LIGHTS}; i ++ ) {
    vec3 rlV = rlPosV[ i ] - geometryPosition;
    float rlD = length( rlV );
    float rlA = 1.0 / max( pow( rlD, 1.5 ), 0.08 );
    float rlW = clamp( 1.0 - pow( rlD / rlRange[ i ], 4.0 ), 0.0, 1.0 );
    rlA *= rlW * rlW;
    vec2 rlQ = max( rlRect[ i ].xy - rlWP.xz, rlWP.xz - rlRect[ i ].zw );
    rlA *= 1.0 - smoothstep( 0.5, 1.25, max( rlQ.x, rlQ.y ) );
    rlA *= smoothstep( -0.3, 0.3, ( rlPosW[ i ].y - rlWP.y ) / rlD );
    if ( rlA > 0.0005 ) {
      rl.color = rlColor[ i ] * rlA;
      rl.direction = rlV / rlD;
      rl.visible = true;
      RE_Direct( rl, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
  }
}
#endif
`;

// Every lit material shares the same uniform objects.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  for (const k in roomU) shader.uniforms[k] = roomU[k];
};

export function syncRoomLights(camera) {
  camera.updateMatrixWorld();
  roomU.rlCamWorld.value.copy(camera.matrixWorld);
  const inv = camera.matrixWorldInverse;
  for (let i = 0; i < ROOM_LIGHTS; i++) roomU.rlPosV.value[i].copy(roomU.rlPosW.value[i]).applyMatrix4(inv);
}
