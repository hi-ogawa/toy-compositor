import sys, json, re, xml.etree.ElementTree as ET
def tc(s):
    if s is None: return None
    h,m,x=s.split(':'); return round(int(h)*3600+int(m)*60+float(x),3)
def prop(e,n):
    p=e.find(f"property[@name='{n}']"); return None if p is None else (p.text or '')
for path in sys.argv[1:]:
    r=ET.parse(path).getroot(); pr=r.find('profile').attrib
    fps=int(pr['frame_rate_num'])/int(pr['frame_rate_den'])
    print(f"\n### {path.split('/')[-1]}  {pr['width']}x{pr['height']}@{fps:g}")
    byid={e.get('id'):e for e in r if e.tag in('producer','chain','playlist','tractor')}
    seq=[t for t in r.findall('tractor') if prop(t,'kdenlive:clipname')]
    for s in seq:
        for ti,trk in enumerate(s.findall('track')):
            sub=byid.get(trk.get('producer'))
            if sub is None or sub.tag!='tractor': continue
            for pl in sub.findall('track'):
                plist=byid[pl.get('producer')]; hide=pl.get('hide'); t=0.0
                for c in plist:
                    if c.tag=='blank': t+=tc(c.get('length')); continue
                    if c.tag!='entry': continue
                    src=byid[c.get('producer')]; a,b=tc(c.get('in')),tc(c.get('out'))
                    res=prop(src,'resource') or prop(src,'kdenlive:clipname') or prop(src,'mlt_service')
                    fx=[]
                    for f in c.findall('filter'):
                        k=prop(f,'kdenlive_id') or prop(f,'mlt_service')
                        rect=prop(f,'rect'); 
                        if rect: k+=' rect='+rect.split('=',1)[1].rsplit(' ',1)[0]
                        if prop(f,'kdenlive_id')=='fadeout' or prop(f,'kdenlive_id')=='fadein':
                            k+=f" {prop(f,'in')}..{prop(f,'out')}"
                        fx.append(k)
                    kind='A' if prop(plist,'kdenlive:audio_track') else 'V'
                    print(f"  trk{ti}{kind} @{t:8.3f}s  src[{a:7.3f}..{b:7.3f}] dur={b-a+1/fps:7.3f}  {res[:55]!s:55}  {'; '.join(fx)}")
                    t+=b-a+1/fps
        g=prop(s,'kdenlive:sequenceproperties.guides')
        if g: print('  guides:', [(x['comment'], x['pos'], round(x['pos']/fps,2)) for x in json.loads(g)])
    dp=lambda n: prop(r.find("playlist[@id='main_bin']"),'kdenlive:docproperties.'+n)
    print('  render:', dp('renderprofile'), 'mode',dp('rendermode'),'guides',dp('renderstartguide'),'->',dp('renderendguide'),'quality',dp('rendercustomquality'),'speed',dp('renderspeed'))
    for p in r.findall('producer'):
        if prop(p,'mlt_service')=='kdenlivetitle':
            x=prop(p,'xmldata'); 
            print('  title:', re.sub(r'\s+',' ',x)[:700])
