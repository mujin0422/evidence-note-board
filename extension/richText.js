// Preserve formatted text in existing notes.content, no DB migration.
// Selection spans count Unicode code points, Pango spans count UTF-8 bytes.
const PREFIX = '\u001eENB_RICH_TEXT_V1\n';
export const characterLength = text => Array.from(text).length;

export function normalizeBoldSpans(spans,size) {
    if (!Array.isArray(spans)) return [];
    const valid=spans.filter(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isInteger))
        .map(([a,b])=>[Math.max(0,a),Math.min(size,b)])
        .filter(([a,b])=>a<b&&a<size).sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    const out=[];
    for (const item of valid) {
        const last=out[out.length-1];
        if (last && item[0]<=last[1]) last[1]=Math.max(last[1],item[1]);
        else out.push([...item]);
    }
    return out;
}

export function decodeRichText(rawInput) {
    const raw=typeof rawInput==='string'?rawInput:'';
    if (!raw.startsWith(PREFIX)) return {text:raw,bold:[]};
    try {
        const doc=JSON.parse(raw.slice(PREFIX.length));
        if (!doc||doc.version!==1||typeof doc.text!=='string'||!Array.isArray(doc.bold)||
            !doc.bold.every(s=>Array.isArray(s)&&s.length===2&&Number.isInteger(s[0])&&
                Number.isInteger(s[1])&&s[0]>=0&&s[1]>s[0]&&
                s[1]<=characterLength(doc.text)))
            return {text:raw,bold:[]};
        return {text:doc.text,bold:normalizeBoldSpans(doc.bold,characterLength(doc.text))};
    } catch {
        return {text:raw,bold:[]}; // Unrecognized user text must stay visible.
    }
}

export function encodeRichText(text,spans) {
    const bold=normalizeBoldSpans(spans,characterLength(text));
    if (!bold.length&&!text.startsWith(PREFIX)) return text;
    return PREFIX+JSON.stringify({version:1,text,bold});
}

export function richTextForNote(note) {
    const doc=decodeRichText(note.content);
    const title=typeof note.title==='string'?note.title:'';
    if (!title||title==='Ghi chú mới') return doc;
    const prefix=doc.text?title+'\n':title;
    const offset=characterLength(prefix);
    return {text:prefix+doc.text,
        bold:doc.bold.map(([a,b])=>[a+offset,b+offset])};
}

export function selectionIsBold(spans,start,end) {
    if (start>=end) return false;
    let point=start;
    for (const [a,b] of spans) {
        if (a>point) return false;
        if (b>point) point=b;
        if (point>=end) return true;
    }
    return false;
}

export function toggleBoldSpans(spans,start,end,length) {
    const old=normalizeBoldSpans(spans,length);
    if (!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>length||
        start>=end) return old;
    if (!selectionIsBold(old,start,end))
        return normalizeBoldSpans([...old,[start,end]],length);
    const remaining=[];
    for (const [a,b] of old) {
        if (b<=start||a>=end) remaining.push([a,b]);
        else {
            if (a<start) remaining.push([a,start]);
            if (b>end) remaining.push([end,b]);
        }
    }
    return normalizeBoldSpans(remaining,length);
}

export function rebaseBoldSpans(previous,current,spans) {
    const before=Array.from(previous),after=Array.from(current);
    const ranges=normalizeBoldSpans(spans,before.length);
    if (previous===current) return ranges;
    let start=0;
    while (start<before.length&&start<after.length&&before[start]===after[start]) start++;
    let suffix=0;
    while (suffix<before.length-start&&suffix<after.length-start&&
        before[before.length-1-suffix]===after[after.length-1-suffix]) suffix++;
    const removedEnd=before.length-suffix,insertedEnd=after.length-suffix;
    const delta=after.length-before.length;
    const updated=[];
    for (const [a,b] of ranges) {
        if (a<start) updated.push([a,Math.min(b,start)]);
        if (b>removedEnd) updated.push([Math.max(a,removedEnd)+delta,b+delta]);
    }
    const inherit=insertedEnd>start&&(
        (start===removedEnd&&ranges.some(([a,b])=>a<start&&start<b))||
        (removedEnd>start&&selectionIsBold(ranges,start,removedEnd)));
    if (inherit) updated.push([start,insertedEnd]);
    return normalizeBoldSpans(updated,after.length);
}

export function byteOffsetForCharacter(text,position) {
    let bytes=0;
    const chars=Array.from(text);
    for (const char of chars.slice(0,Math.max(0,Math.min(chars.length,position)))) {
        const cp=char.codePointAt(0);
        bytes+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;
    }
    return bytes;
}
