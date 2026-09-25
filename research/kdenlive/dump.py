import sys, xml.etree.ElementTree as ET
SKIP_PROPS = ('kdenlive:file_hash','kdenlive:file_size','meta.media','meta.attr','kdenlive:docproperties','xml_retain','kdenlive:sequenceproperties.groups','kdenlive:control_uuid','kdenlive:monitor','kdenlive:thumb','kdenlive:originalurl','kdenlive:audio_max','kdenlive:clip_type','seekable','aspect_ratio','set.test','creation_time','global_feed','kdenlive:uuid','kdenlive:id','kdenlive:folderid','kdenlive:sequenceproperties.guides','kdenlive:sequenceproperties.zonein','kdenlive:sequenceproperties.zoneout','kdenlive:sequenceproperties.tracks','kdenlive:sequenceproperties.activeTrack','kdenlive:sequenceproperties.position','kdenlive:sequenceproperties.scrollPos','kdenlive:sequenceproperties.verticalzoom','kdenlive:sequenceproperties.zoom','kdenlive:sequenceproperties.tracksCount','kdenlive:sequenceproperties.hasAudio','kdenlive:sequenceproperties.hasVideo','kdenlive:sequenceproperties.documentuuid','kdenlive:sequenceproperties.audioTarget','kdenlive:sequenceproperties.videoTarget','kdenlive:sequenceproperties.disablepreview','kdenlive:sequenceproperties.previewchunks','kdenlive:sequenceproperties.dirtypreviewchunks','kdenlive:producer_type','kdenlive:duration','kdenlive:thumbnailFrame')
def props(e, keep=None):
    out={}
    for p in e.findall('property'):
        n=p.get('name'); v=(p.text or '')
        if n.startswith('meta.media') or n.startswith('meta.attr') or n in SKIP_PROPS: continue
        if keep and n not in keep: continue
        if len(v)>160: v=v[:160]+'...'
        out[n]=v
    return out
r=ET.parse(sys.argv[1]).getroot()
p=r.find('profile').attrib; print('PROFILE', p['width'],'x',p['height'],'@',p['frame_rate_num'],'/',p['frame_rate_den'])
for e in r:
    if e.tag in ('producer','chain'):
        print(f"\n[{e.tag} {e.get('id')}] in={e.get('in')} out={e.get('out')}")
        for k,v in props(e, ('resource','kdenlive:clipname','mlt_service','length','meta.media.frame_rate_num','kdenlive:sequenceproperties.documentuuid','xmldata','templatetext','force_fps','kdenlive:clip_type')).items(): print('   ',k,'=',v)
    elif e.tag=='playlist':
        items=[]
        for c in e:
            if c.tag=='blank': items.append(f"blank {c.get('length')}")
            elif c.tag=='entry':
                fs=[]
                for f in c.findall('filter'):
                    fp=props(f)
                    fs.append({k:v for k,v in fp.items() if k in ('mlt_service','kdenlive_id','rect','rotation','distort','level','gain','compositing','transition.rect','geometry','crop','left','right','top','bottom','center','scale','fill','kdenlive:collapsed') or k.startswith('av.')})
                items.append(f"entry {c.get('producer')} {c.get('in')}..{c.get('out')} filters={fs}")
        pp=props(e,('kdenlive:audio_track','kdenlive:track_name','hide','kdenlive:locked_track'))
        if items or pp: print(f"\n[playlist {e.get('id')}] {pp}"); [print('   ',i) for i in items]
    elif e.tag=='tractor':
        print(f"\n[tractor {e.get('id')}] in={e.get('in')} out={e.get('out')} {props(e,('kdenlive:clipname','kdenlive:sequenceproperties.tracksCount','kdenlive:producer_type'))}")
        for tr in e.findall('track'): print('    track', tr.attrib)
        for tn in e.findall('transition'):
            print('    transition', props(tn, ('mlt_service','kdenlive_id','a_track','b_track','rect','compositing','distort','internal_added','always_active')))
        for f in e.findall('filter'):
            print('    filter', props(f, ('mlt_service','kdenlive_id','rect','internal_added','disable')))
