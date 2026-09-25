import * as THREE from 'three';
function random(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
/** Authored at world scale; deterministic and available before the first frame. */
export function terrainMaterials(anisotropy: number) {
  const textures: THREE.Texture[] = [];
  function texture(w: number, h: number, pixel: (x: number, y: number, n: number) => number[]) {
    const rng = random(721);
    const data = new Uint8Array(w * h * 4);
    for(let y = 0; y < h; y++)
      for(let x = 0; x < w; x++) {
        const rgb = pixel(x, y, rng());
        const i = (y * w + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    const t = new THREE.DataTexture(data, w, h);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(8, anisotropy);
    t.needsUpdate = true;
    textures.push(t);
    return t;
  }
  const grass = texture(512, 512, (x, y, n) => {
    const blades = Math.sin(x * 2.1 + Math.sin(y * .09) * 2) * Math.sin(y * .3);
    const v = (n - .5) * 26 + blades * 7 + Math.sin(x * .055 + y * .029) * 4;
    return [79 + v * .7, 123 + v, 39 + v * .5];
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(75, 75);
  const turf = new THREE.MeshStandardMaterial({ map: grass, roughness: .96, bumpMap: grass, bumpScale: .012 });
  turf.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 turfWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nturfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 turfWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float ring = length(turfWorld.xz - vec2(0.0, 10.0));
      float stripe = smoothstep(-0.14, 0.14, sin(ring * 0.77));
      diffuseColor.rgb *= mix(0.89, 1.12, stripe);
    `);
  };
  turf.customProgramCacheKey = () => 'oval-turf-v1';
  const pitchMap = texture(512, 2048, (x, y, n) => {
    const u = x / 512;
    const lane = Math.exp(-Math.pow((u - .5) / .33, 8));
    const grain = (n - .5) * 22 + Math.sin(x * .074 + Math.sin(y * .015) * 3) * 3;
    const edge = (1 - lane) * 9;
    return [194 + grain + edge, 157 + grain + edge, 100 + grain * .7 + edge];
  });
  const pitchData = pitchMap.image.data as Uint8Array;
  for(let j = 0; j < 22; j++) {
    const cx = (.25 + .5 * ((j * .618) % 1)) * 512, cy = ((j * .137) % 1) * 2048;
    for(let y = Math.max(0, Math.floor(cy - 36)); y < Math.min(2048, cy + 36); y++)
      for(let x = Math.max(0, Math.floor(cx - 27)); x < Math.min(512, cx + 27); x++) {
        const wear = Math.exp(-2 * (((x - cx) / 14) ** 2 + ((y - cy) / 18) ** 2)) * (12 + j % 7), i = (y * 512 + x) * 4;
        for(let c = 0; c < 3; c++)
          pitchData[i + c] = Math.max(0, pitchData[i + c] - wear);
      }
  }
  const pitch = new THREE.MeshStandardMaterial({ map: pitchMap, bumpMap: pitchMap, bumpScale: .018, roughness: .97 });
  return { turf, pitch, textures };
}
export function daylightSky() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { zenith: { value: new THREE.Color(0x438fc5) }, horizon: { value: new THREE.Color(0xbde1ee) } },
    vertexShader: 'varying vec3 ray; void main(){ ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 ray; uniform vec3 zenith; uniform vec3 horizon;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      void main(){vec3 d=normalize(ray);float h=max(d.y,0.0);vec3 color=mix(horizon,zenith,smoothstep(0.0,.38,h));
        vec2 p=d.xz/(h+.18)*2.1;float n=noise(p)*.58+noise(p*2.03)*.28+noise(p*4.07)*.14;
        float clouds=smoothstep(.53,.72,n)*smoothstep(.015,.17,h)*(1.0-smoothstep(.7,.95,h));
        color=mix(color,vec3(1.0,.97,.89),clouds*.94);gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  mesh.name = 'Daylight sky and soft clouds';
  mesh.renderOrder = -10;
  return mesh;
}
export function contactTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for(let y = 0; y < size; y++)
    for(let x = 0; x < size; x++) {
      const r = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1), i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 255);
    }
  const t = new THREE.DataTexture(data, size, size);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
