import {useEffect, useRef, useState} from 'react';
import {api} from './api';
import type {Job, Platform, Mode} from '../shared/types';

export function useBusinessSearch(jobs: Job[], platform: Platform, mode: Mode, initial: string) {
  const [terms,setTerms]=useState<string[]>([]);
  const [keyword,setKeyword]=useState(initial);
  const automatic=useRef(initial);
  const successful=jobs.find(j=>j.type==='search'&&j.platform===platform&&j.source===mode&&j.status==='completed'&&j.count>0)?.keyword;
  useEffect(()=>{
    let active=true;
    api<{suggestedKeywords:string[]}>('/harta/context').then(result=>{if(active)setTerms(result.suggestedKeywords);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const suggestions=[...new Set([successful,...terms].filter((s):s is string=>!!s))].slice(0,3);
  const first=initial || suggestions[0] || '';
  useEffect(()=>{
    const previous=automatic.current;
    automatic.current=first;
    setKeyword(current=>current===previous ? first : current);
  },[first]);
  return {keyword,setKeyword,suggestions};
}
