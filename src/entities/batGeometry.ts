import * as THREE from 'three';

/** Reference-based willow profile. +Z is the striking face; the raised spine
 * lives on -Z. Dimensions and grip origin match the animation/contact rig. */
export function bladeGeometry() {
  // y, half-width, front bow, edge thickness, central spine thickness.
  const stations = [
    [-.134,.025,.018,.022,.032], [-.158,.060,.019,.026,.040],
    [-.185,.067,.020,.028,.049], [-.280,.068,.022,.031,.062],
    [-.440,.068,.024,.034,.080], [-.580,.068,.025,.034,.083],
    [-.700,.067,.024,.031,.073], [-.785,.065,.022,.028,.055],
    [-.824,.060,.020,.026,.040], [-.834,.048,.018,.022,.028],
  ];
  const positions:number[]=[], indices:number[]=[];
  for(const [y,w,face,edge,spine] of stations) {
    const ring = [[-w,face-.004],[-w*.88,face],[w*.88,face],[w,face-.004],
      [w,face-edge],[w*.78,face-edge-.006],[0,face-spine],
      [-w*.78,face-edge-.006],[-w,face-edge]];
    for(const [x,z] of ring) positions.push(x,y,z);
  }
  const count=9;
  for(let row=0;row<stations.length-1;row++) for(let col=0;col<count;col++) {
    const a=row*count+col,b=a+count,c=row*count+(col+1)%count,d=c+count;
    indices.push(a,b,d,a,d,c);
  }
  for(let col=1;col<count-1;col++) {
    indices.push(0,col,col+1);
    const end=(stations.length-1)*count;
    indices.push(end,end+col+1,end+col);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Ribbed rubber grip in one draw call, with a flared end cap. */
export function gripGeometry() {
  const profile=[new THREE.Vector2(.019,-.122)];
  for(let n=0;n<28;n++) {
    const y=-.12+n*.012;
    const radius=.0215+.0015*Math.sin(n/27*Math.PI);
    profile.push(new THREE.Vector2(radius,y),new THREE.Vector2(radius+.0015,y+.003),
      new THREE.Vector2(radius+.0015,y+.006),new THREE.Vector2(radius,y+.009));
  }
  profile.push(new THREE.Vector2(.022,.218),new THREE.Vector2(.028,.222),
    new THREE.Vector2(.028,.234),new THREE.Vector2(.022,.238),new THREE.Vector2(0,.238));
  return new THREE.LatheGeometry(profile,20);
}
