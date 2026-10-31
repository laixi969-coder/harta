import { describe, expect, it } from 'vitest';
import { makeImagePages, parseImagePages, validateImagePageSet, imagePageSetWarning, wrapCanvasText } from './image-pages.js';

describe('图文逐页模板',()=>{
  it('accepts 1–10 pages and refuses to truncate long content',()=>{
    expect(parseImagePages('一页')).toEqual(['一页']);
    expect(()=>parseImagePages('')).toThrow('1至10');
    expect(()=>parseImagePages(Array(11).fill('一页').join('\n'))).toThrow('1至10');
    expect(()=>parseImagePages(`${'字'.repeat(91)}\n二\n三`)).toThrow('90字');
    expect(parseImagePages('第一段\n\n第二段\n第三段')).toEqual(['第一段','第二段','第三段']);
  });
  it('逐页文案与已保存图片数量一致且编号连续，旧素材缺页不能沿用',()=>{
    expect(validateImagePageSet('第一行\n\n第二行',['page-02.png','page-01.png'])).toEqual(['page-01.png','page-02.png']);
    expect(()=>validateImagePageSet('第一行\n第二行',['page-01.png'])).toThrow('图文页不完整');
    expect(imagePageSetWarning('第一行\n第二行',['page-01.png'])).toContain('缺页');
    expect(imagePageSetWarning('',[])).toBe('');
    expect(()=>validateImagePageSet('第一行\n第二行',['page-01.png','page-01.png'])).toThrow('图文页不完整');
    expect(()=>validateImagePageSet('第一行\n第二行',['page-01.png','page-03.png'])).toThrow('图文页不完整');
  });
  it('wraps by measured width without losing characters',()=>{
    const ctx={measureText:s=>({width:Array.from(s).length*10})};
    const text='厨房🙂ABC选择';expect(wrapCanvasText(ctx,text,30).join('')).toBe(text);
  });
  it('renders one image per supplied line without inventing content',()=>{
    const seen=[];const canvas=()=>({getContext:()=>({fillRect(){},fillText:(text)=>seen.push(text),measureText:s=>({width:Array.from(s).length*50})}),toDataURL:()=> 'data:image/png;base64,AA=='});
    const pages=makeImagePages('核对尺寸\n确认材料\n比较费用','paper',canvas);
    expect(pages.map(p=>p.number)).toEqual([1,2,3]);expect(seen).toContain('核对尺寸');expect(seen).toContain('确认材料');expect(seen).toContain('比较费用');
  });
});
