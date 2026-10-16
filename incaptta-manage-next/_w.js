const fs=require("fs");
const path=require("path");
const base="c:/Users/REAL TIME/Documents/incaptta/IncapttaPro/incaptta-manage-next";
function w(r,c){const p=path.join(base,r);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c,"utf-8");console.log("W: "+r);}const f1 = `'use client'\n`;