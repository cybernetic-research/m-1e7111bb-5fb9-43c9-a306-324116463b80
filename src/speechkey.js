function captionWords(c){const title=(c.title??"").trim();const body=String(c.say??c.text??"").replace(/\s*Sources?: [^]*$/,"").trim();return{title,body}}function speechKey({title,body}){const s=`${title}
${body}`;let h=2166136261;for(let k=0;k<s.length;k++){h^=s.charCodeAt(k);h=Math.imul(h,16777619)>>>0}return h.toString(16).padStart(8,"0")}export{captionWords,speechKey};
