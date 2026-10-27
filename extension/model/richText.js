// Preserve formatted text in existing notes.content, no DB migration.
// Selection spans count Unicode code points, Pango spans count UTF-8 bytes.
const PREFIX = '\u001eENB_RICH_TEXT_V1\n';
export const BADGE_PLACEHOLDER = '\ufffc';
export const CEFR_LEVELS = Object.freeze(['A1','A2','B1','B2','C1','C2']);
// Count Unicode code points rather than UTF-16 code units.
export const characterLength = text => Array.from(text).length;

// Validate, sort and merge overlapping bold ranges.
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

// Keep only badges anchored to their reserved inline placeholder.
export function normalizeBadges(badges,text) {
    if (!Array.isArray(badges)) return [];
    const chars=Array.from(text);
    const used=new Set();
    return badges.filter(item=>item&&Number.isInteger(item.at)&&
        CEFR_LEVELS.includes(item.level)&&item.at>=0&&item.at<chars.length&&
        chars[item.at]==='\ufffc'&&!used.has(item.at))
        .sort((a,b)=>a.at-b.at)
        .map(item=>{used.add(item.at);return {at:item.at,level:item.level};});
}

// The first badge implementation reserved width with two real spaces. Convert
// those saved V1 documents to one object-replacement character so Backspace
// removes the whole badge once. New payloads carry badgeUnit=1 and are not
// ambiguous with spaces intentionally typed after a badge.
function compactLegacyBadges(text,bold,red,badges,badgeUnit) {
    if (badgeUnit===1 || !badges.length)
        return {text,bold,red,badges};
    const chars=Array.from(text);
    const removed=new Set();
    for (const {at} of badges) {
        if (chars[at+1]===' ' && chars[at+2]===' ') {
            removed.add(at+1);
            removed.add(at+2);
        }
    }
    if (!removed.size)
        return {text,bold,red,badges};
    const shift=position=>position-[...removed]
        .filter(index=>index<position).length;
    const compactText=chars.filter((_char,index)=>!removed.has(index)).join('');
    const mapSpans=spans=>normalizeBoldSpans(
        spans.map(([start,end])=>[shift(start),shift(end)]),
        characterLength(compactText));
    return {
        text:compactText,
        bold:mapSpans(bold),
        red:mapSpans(red),
        badges:normalizeBadges(badges.map(item=>({...item,at:shift(item.at)})),
            compactText),
    };
}

// Decode the versioned payload, preserving unrecognized content as plain text.
export function decodeRichText(rawInput) {
    const raw=typeof rawInput==='string'?rawInput:'';
    if (!raw.startsWith(PREFIX)) return {text:raw,bold:[],red:[],badges:[]};
    try {
        const doc=JSON.parse(raw.slice(PREFIX.length));
        if (!doc||doc.version!==1||typeof doc.text!=='string'||!Array.isArray(doc.bold)||
            !doc.bold.every(s=>Array.isArray(s)&&s.length===2&&Number.isInteger(s[0])&&
                Number.isInteger(s[1])&&s[0]>=0&&s[1]>s[0]&&
                s[1]<=characterLength(doc.text)))
            return {text:raw,bold:[],red:[],badges:[]};
        const size=characterLength(doc.text);
        return compactLegacyBadges(doc.text,
            normalizeBoldSpans(doc.bold,size),
            normalizeBoldSpans(doc.red??[],size),
            normalizeBadges(doc.badges??[],doc.text),doc.badgeUnit);
    } catch {
        return {text:raw,bold:[],red:[],badges:[]};
    }
}

// Store plain text directly unless formatting requires the versioned envelope.
export function encodeRichText(text,spans,redSpans=[],badges=[]) {
    const size=characterLength(text);
    const bold=normalizeBoldSpans(spans,size);
    const red=normalizeBoldSpans(redSpans,size);
    const safeBadges=normalizeBadges(badges,text);
    if (!bold.length&&!red.length&&!safeBadges.length&&!text.startsWith(PREFIX))
        return text;
    return PREFIX+JSON.stringify({version:1,text,bold,red,badges:safeBadges,
        badgeUnit:1});
}

// Merge legacy titles into display text while shifting format ranges.
export function richTextForNote(note) {
    const doc=decodeRichText(note.content);
    const title=typeof note.title==='string'?note.title:'';
    if (!title||title==='Ghi chú mới') return doc;
    const prefix=doc.text?title+'\n':title;
    const offset=characterLength(prefix);
    return {text:prefix+doc.text,
        bold:doc.bold.map(([a,b])=>[a+offset,b+offset]),
        red:doc.red.map(([a,b])=>[a+offset,b+offset]),
        badges:doc.badges.map(item=>({...item,at:item.at+offset}))};
}

// Test whether every character in a selection is already bold.
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

// Add bold to a selection, or remove it when fully bold.
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

// Move formatting ranges across one contiguous text edit.
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

// Shift badge anchors across one contiguous edit and drop deleted badges.
export function rebaseBadges(previous,current,badges) {
    const before=Array.from(previous),after=Array.from(current);
    let start=0;
    while (start<before.length&&start<after.length&&before[start]===after[start]) start++;
    let suffix=0;
    while (suffix<before.length-start&&suffix<after.length-start&&
        before[before.length-1-suffix]===after[after.length-1-suffix]) suffix++;
    const removedEnd=before.length-suffix;
    const delta=after.length-before.length;
    return normalizeBadges((badges??[]).flatMap(item=>{
        if (item.at<start) return [item];
        if (item.at>=removedEnd) return [{...item,at:item.at+delta}];
        return [];
    }),current);
}

// Insert a CEFR badge placeholder while keeping existing anchors stable.
export function insertBadge(text,badges,position,level) {
    const chars=Array.from(text);
    const at=Math.max(0,Math.min(chars.length,
        Number.isInteger(position)?position:chars.length));
    if (!CEFR_LEVELS.includes(level))
        return {text,badges:normalizeBadges(badges,text),cursor:at};
    chars.splice(at,0,...Array.from(BADGE_PLACEHOLDER));
    const next=chars.join('');
    const shifted=(badges??[]).map(item=>item.at>=at
        ? {...item,at:item.at+characterLength(BADGE_PLACEHOLDER)} : item);
    shifted.push({at,level});
    return {text:next,badges:normalizeBadges(shifted,next),
        cursor:at+characterLength(BADGE_PLACEHOLDER)};
}

// Convert a Unicode character index to the UTF-8 byte offset Pango expects.
export function byteOffsetForCharacter(text,position) {
    let bytes=0;
    const chars=Array.from(text);
    for (const char of chars.slice(0,Math.max(0,Math.min(chars.length,position)))) {
        const cp=char.codePointAt(0);
        bytes+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;
    }
    return bytes;
}
