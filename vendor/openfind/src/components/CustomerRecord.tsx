import { useWorkspace } from '../context';
import { hartaHandoff } from '../api';
import { PageHeading, Empty } from './ui';
import { SalesWorkbench } from './SalesWorkbench';
import { WorkSource } from './WorkSource';
// Harta owns the contact list. This view edits only the contact opened there.
export function CustomerRecord() {
  const { data, refresh, notify } = useWorkspace();
  const id = new URLSearchParams(location.search).get('lead');
  const lead = data.leads.find(row=>row.id===id), note = data.notes.find(row=>row.id===lead?.noteId);
  const back = async () => { if (!lead) return; try { await hartaHandoff(lead.noteId,lead.commentId); } catch(e) { notify((e as Error).message,true); } };
  return <><PageHeading title={lead?.name || '沟通记录'} action={<button className="btn" onClick={()=>void back()}>返回客户档案</button>}/>{lead ? <><blockquote className="source-quote">{lead.content}</blockquote>{note && <WorkSource note={note}/>}<SalesWorkbench showContactLink={false} key={lead.id} lead={lead} note={note} onChange={()=>void refresh()}/></> : <Empty title="请从客户档案打开沟通记录" sub="选择已核实的客户后继续。"/>}</>;
}
