// Two-cascade sun shadows with no new uniforms: a second shadow-casting directional
// light whose colour is exactly zero is treated as the far cascade of the first one.
// Inside the near (dynamic, sharp) shadow frustum its map is used; toward and past its
// edge the shader cross-fades to the far map, which covers hundreds of metres of
// static scenery (trees, stands, buildings, hills) and is only re-rendered when the
// focus has moved on. Patched into the lighting chunk once, before any compile.
import * as THREE from 'three';

const ORIG = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const PATCH = /* glsl */`
		{
		float dirShadow = ( directLight.visible && receiveShadow && any( greaterThan( directLight.color, vec3( 0.0 ) ) ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#if ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
		if ( receiveShadow && directionalLights[ 1 ].color == vec3( 0.0 ) ) {
			vec3 nearC = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
			vec2 ne = min( nearC.xy, 1.0 - nearC.xy );
			float inNear = smoothstep( 0.0, 0.1, min( ne.x, ne.y ) );
			if ( inNear < 1.0 ) {
				vec3 farC = vDirectionalShadowCoord[ 1 ].xyz / vDirectionalShadowCoord[ 1 ].w;
				vec2 fe = min( farC.xy, 1.0 - farC.xy );
				float inFar = smoothstep( 0.0, 0.08, min( fe.x, fe.y ) );
				float farS = 1.0;
				if ( inFar > 0.0 ) {
					DirectionalLightShadow farSh = directionalLightShadows[ 1 ];
					farS = mix( 1.0, getShadow( directionalShadowMap[ 1 ], farSh.shadowMapSize, farSh.shadowIntensity, farSh.shadowBias, farSh.shadowRadius, vDirectionalShadowCoord[ 1 ] ), inFar );
				}
				dirShadow = mix( farS, dirShadow, inNear );
			}
		}
		#endif
		directLight.color *= dirShadow;
		}`;

let patched = false;
export function installShadowCascade() {
  if (patched) return true;
  const src = THREE.ShaderChunk.lights_fragment_begin;
  if (!src.includes(ORIG)) { console.warn('shadowCascade: lighting chunk changed, far cascade disabled'); return false; }
  THREE.ShaderChunk.lights_fragment_begin = src.replace(ORIG, PATCH);
  patched = true;
  return true;
}

// layer used to mark static scenery that the far cascade renders
export const STATIC_LAYER = 1;
