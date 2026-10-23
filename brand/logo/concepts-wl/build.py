import math
T=math.tan(math.radians(15)); SW=40; BASE=216
f=lambda v: round(v,2)
def slant(top,bot):  # parallelogram, horizontal width SW at top and bottom
    (xt,yt),(xb,yb)=top,bot; h=SW/2
    return [(xt-h,yt),(xt+h,yt),(xb+h,yb),(xb-h,yb)]
def poly(pts): return "M"+" L".join(f"{f(x)},{f(y)}" for x,y in pts)+" Z"
def rising_w(x0,peaks,last_vertical=False):
    p1,p2,p3=peaks
    T0=(x0,p1); B1=(x0+(BASE-p1)*T,BASE); T2=(B1[0]+(BASE-p2)*T,p2); B3=(T2[0]+(BASE-p2)*T,BASE)
    shapes=[slant(T0,B1),slant(T2,B1),slant(T2,B3)]
    if last_vertical: return shapes,B3
    T4=(B3[0]+(BASE-p3)*T,p3); shapes.append(slant(T4,B3)); return shapes,T4
def svg(shapes,name):
    xs=[x for s in shapes for x,_ in s]; ys=[y for s in shapes for _,y in s]
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); w,h=x1-x0,y1-y0; side=max(w,h)*1.18
    cx,cy=(x0+x1)/2,(y0+y1)/2-max(w,h)*0.01  # optical: a hair above centre
    vb=f"{f(cx-side/2)} {f(cy-side/2)} {f(side)} {f(side)}"
    d=" ".join(poly(s) for s in shapes)
    open(name,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><title>The Warrior Leaders</title><path d="{d}" fill="#000"/></svg>')
    return vb
FOOT=58
# 1 - L is the leader: upright L, tallest stroke
sh,T4=rising_w(0,(120,88,56)); lx=T4[0]+SW/2+18
sh+= [[(lx,24),(lx+SW,24),(lx+SW,BASE-SW),(lx+SW+FOOT,BASE-SW),(lx+SW+FOOT,BASE),(lx,BASE)]]
svg(sh,'wl1-symbol.svg')
# 2 - Shared stroke: the W's last up-stroke is also the L's stem; the foot runs out along the baseline
sh,T4=rising_w(0,(120,88,40)); B3x=T4[0]-(BASE-40)*T
fx0=B3x+SW/2; sh+= [[(fx0-4,BASE-SW),(T4[0]+SW/2+FOOT,BASE-SW),(T4[0]+SW/2+FOOT,BASE),(fx0-4,BASE)]]
svg(sh,'wl2-symbol.svg')
# 3 - Sprint: L leans forward at the W's 75 deg, top highest
sh,T4=rising_w(0,(120,88,56)); top=24; lb=BASE-SW
gx=T4[0]+SW/2-27+(BASE-top)*T   # L stem top-left x (stem bottom sits clear of the W)
bl=gx-(BASE-top)*T              # stem bottom-left x
br=gx+SW-(lb-top)*T             # stem inner corner x at foot top
sh+= [[(gx,top),(gx+SW,top),(br,lb),(br+FOOT,lb),(br+FOOT,BASE),(bl,BASE)]]
svg(sh,'wl3-symbol.svg')
