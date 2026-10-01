// CPU geometry is built once; GPU buffers are immutable during a race.
export class Geometry {
  constructor() { this.positions=[]; this.normals=[]; this.colors=[]; }
  triangle(a,b,c,color) {
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
    const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const l=Math.hypot(nx,ny,nz)||1; nx/=l;ny/=l;nz/=l;
    for(const p of [a,b,c]) { this.positions.push(...p);this.normals.push(nx,ny,nz);this.colors.push(...color); }
  }
  quad(a,b,c,d,color) { this.triangle(a,b,c,color);this.triangle(a,c,d,color); }
  box(x,y,z,sx,sy,sz,color,angle=0) {
    const s=Math.sin(angle),c=Math.cos(angle);
    const p=[[-sx,-sy,-sz],[sx,-sy,-sz],[sx,sy,-sz],[-sx,sy,-sz],[-sx,-sy,sz],[sx,-sy,sz],[sx,sy,sz],[-sx,sy,sz]].map(v=>[x+v[0]*c+v[2]*s,y+v[1],z-v[0]*s+v[2]*c]);
    for(const f of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]])this.quad(p[f[0]],p[f[1]],p[f[2]],p[f[3]],color);
  }
  loft(rings,color) {
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<rings[i].length;j++) {
      const k=(j+1)%rings[i].length;this.quad(rings[i][k],rings[i][j],rings[i+1][j],rings[i+1][k],color);
    }
    for(let j=1;j<rings[0].length-1;j++)this.triangle(rings[0][0],rings[0][j],rings[0][j+1],color);
    const end=rings[rings.length-1];for(let j=1;j<end.length-1;j++)this.triangle(end[0],end[j+1],end[j],color);
  }
  // Cylinder axle runs along X; optional spoke pattern visibly rotates.
  cylinder(x,y,z,r,width,color,segments=16,spokes=false) {
    for(let i=0;i<segments;i++) {
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
      const ay=y+Math.cos(a)*r,az=z+Math.sin(a)*r,by=y+Math.cos(b)*r,bz=z+Math.sin(b)*r;
      this.quad([x-width/2,ay,az],[x+width/2,ay,az],[x+width/2,by,bz],[x-width/2,by,bz],color);
      for(const side of [-1,1])this.triangle([x+side*width/2,y,z],[x+side*width/2,ay,az],[x+side*width/2,by,bz],spokes&&i%3===0?[.12,.15,.18]:color);
    }
  }
  get vertexCount(){return this.positions.length/3;}
}
