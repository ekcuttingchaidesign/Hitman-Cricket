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
  // Seamless isotropic detail: no directional sine waves or pixel-noise bump map.
  const rng = random(917);
  const grids = [16, 64, 256].map(size => ({ size, values: Float32Array.from({ length: size * size }, () => rng()) }));
  const noise = (x: number, y: number, grid: typeof grids[number]) => {
    const u = x / 512 * grid.size, v = y / 512 * grid.size;
    const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (dx: number, dy: number) => grid.values[((iy + dy) % grid.size) * grid.size + (ix + dx) % grid.size];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0,0), at(1,0), sx), THREE.MathUtils.lerp(at(0,1), at(1,1), sx), sy) - .5;
  };
  const grass = texture(512, 512, (x, y, n) => {
    const detail = noise(x,y,grids[0])*5 + noise(x,y,grids[1])*8 + noise(x,y,grids[2])*6 + (n-.5)*2;
    return [73 + detail * .65, 116 + detail, 65 + detail * .55];
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(64, 64);
  const turf = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
  turf.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 turfWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nturfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 turfWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float ring = length(turfWorld.xz - vec2(0.0, 10.0));
      float stripe = smoothstep(-0.20, 0.20, sin(ring * 0.77));
      diffuseColor.rgb *= mix(0.94, 1.07, stripe);
    `);
  };
  turf.customProgramCacheKey = () => 'oval-turf-v2';
  const pitchMap = texture(512, 2048, (x, y, n) => {
    const u = x / 512;
    const lane = Math.exp(-Math.pow((u - .5) / .33, 8));
    const grain = (n - .5) * 10 + noise(x,y % 512,grids[1])*3;
    const edge = (1 - lane) * 9;
    return [185 + grain + edge, 169 + grain + edge, 135 + grain * .7 + edge];
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
  const pitch = new THREE.MeshStandardMaterial({ map: pitchMap, roughness: .97 });
  return { turf, pitch, textures };
}
export function daylightSky() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { zenith: { value: new THREE.Color(0x70afd2) }, horizon: { value: new THREE.Color(0xcce6ef) } },
    vertexShader: 'varying vec3 ray; void main(){ ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 ray; uniform vec3 zenith; uniform vec3 horizon;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      void main(){vec3 d=normalize(ray);float h=max(d.y,0.0);vec3 color=mix(horizon,zenith,smoothstep(0.0,.38,h));
        vec2 p=d.xz/(h+.18)*2.1;float n=noise(p)*.58+noise(p*2.03)*.28+noise(p*4.07)*.14;
        float clouds=smoothstep(.53,.72,n)*smoothstep(.015,.17,h)*(1.0-smoothstep(.7,.95,h));
        color=mix(color,vec3(.97,.985,1.0),clouds*.94);gl_FragColor=vec4(color,1.0);
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
