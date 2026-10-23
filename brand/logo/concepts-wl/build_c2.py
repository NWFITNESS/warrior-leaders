import math
T=math.tan(math.radians(15)); SW=40; BASE=216; FOOT=58; GOLD='#aa8601'
f=lambda v: round(v,2)
def slant(top,bot):
    (xt,yt),(xb,yb)=top,bot; h=SW/2
    return [(xt-h,yt),(xt+h,yt),(xb+h,yb),(xb-h,yb)]
def poly(pts): return "M"+" L".join(f"{f(x)},{f(y)}" for x,y in pts)+" Z"
p1,p2,p3=120,88,56
T0=(0,p1); B1=(T0[0]+(BASE-p1)*T,BASE); T2=(B1[0]+(BASE-p2)*T,p2); B3=(T2[0]+(BASE-p2)*T,BASE); T4=(B3[0]+(BASE-p3)*T,p3)
W=[slant(T0,B1),slant(T2,B1),slant(T2,B3),slant(T4,B3)]
# L: same top as the W's last peak, parallel to it, GAP apart (horizontal)
GAP=10; top=p3; lb=BASE-SW
gx=T4[0]+SW/2+GAP          # stem top-left x (parallel strokes -> constant gap)
bl=gx-(BASE-top)*T         # stem bottom-left x
br=gx+SW-(lb-top)*T        # inner corner at foot top
L=[(gx,top),(gx+SW,top),(br,lb),(br+FOOT,lb),(br+FOOT,BASE),(bl,BASE)]
pts=[p for s in W for p in s]+L
xs=[x for x,_ in pts]; ys=[y for _,y in pts]
x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); side=max(x1-x0,y1-y0)*1.18
cx,cy=(x0+x1)/2,(y0+y1)/2-2
vb=f"{f(cx-side/2)} {f(cy-side/2)} {f(side)} {f(side)}"
w_d=" ".join(poly(s) for s in W); l_d=poly(L)
def write(name,wc,lc):
    open(name,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><title>The Warrior Leaders</title><path d="{w_d}" fill="{wc}"/><path d="{l_d}" fill="{lc}"/></svg>')
write('wl3-v2-symbol.svg','#000',GOLD)
write('wl3-v2-symbol-dark.svg','#fff',GOLD)     # for dark backgrounds
write('wl3-v2-symbol-black.svg','#000','#000')  # one-colour
# lockup (placeholder live text for the name)
vbv=[float(v) for v in vb.split()]; sc=256/vbv[3]
for name,wc,tc,bg in [('wl3-v2-lockup.svg','#000','#000',None),('wl3-v2-lockup-dark.svg','#fff','#fff','#0a0a0a')]:
    rect=f'<rect width="800" height="256" fill="{bg}"/>' if bg else ''
    open(name,'w').write(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 256">{rect}
<g transform="scale({sc:.4f}) translate({-vbv[0]:.2f},{-vbv[1]:.2f})"><path d="{w_d}" fill="{wc}"/><path d="{l_d}" fill="{GOLD}"/></g>
<text x="284" y="118" font-family="League Spartan, Montserrat, Arial Black, sans-serif" font-weight="700" font-size="44" letter-spacing="6" fill="{tc}">THE WARRIOR</text>
<text x="280" y="200" font-family="League Spartan, Montserrat, Arial Black, sans-serif" font-weight="800" font-size="92" letter-spacing="2" fill="{GOLD}">LEADERS</text>
</svg>''')
