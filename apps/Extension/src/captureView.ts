import { randomBytes } from "node:crypto"

export function captureHtml(): string {
    const nonce = randomBytes(16).toString("hex")
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
body { font-family:var(--vscode-font-family); font-size:var(--vscode-font-size); color:var(--vscode-foreground); padding:0 8px; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th, td { text-align:left; padding:6px 5px; border-bottom:1px solid var(--vscode-panel-border); }
th { font-weight:600; }
col { width:30%; }
col:first-child { width:40%; }
td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
time { font-size:.9em; }
tr[data-id] { cursor:pointer; }
tr[data-id]:hover, tr[data-id]:focus { background:var(--vscode-list-hoverBackground); outline:1px solid var(--vscode-focusBorder); }
tr[aria-selected=true] { background:var(--vscode-list-activeSelectionBackground); color:var(--vscode-list-activeSelectionForeground); }
#errors { color:var(--vscode-errorForeground); white-space:pre-line; }
#status { color:var(--vscode-descriptionForeground); }
</style></head><body>
<div id="errors" role="alert"></div><p id="status" role="status">Loading captures…</p>
<table aria-label="Captured failed transactions"><colgroup><col><col><col></colgroup>
<thead><tr><th scope="col">Timestamp</th><th scope="col">Project</th><th scope="col">Validator</th></tr></thead><tbody id="rows"></tbody></table>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let selected;
let busy = false;
window.addEventListener('message', ({data}) => {
    if (data.kind !== 'captures') return;
    busy = data.busy;
    document.getElementById('errors').textContent = data.errors.join('\\n');
    document.getElementById('status').textContent = busy ? 'Loading…' : data.rows.length ? '' : data.empty;
    const body = document.getElementById('rows');
    const focused = document.activeElement && document.activeElement.dataset.id;
    body.replaceChildren();
    for (const row of data.rows) {
        const tr = document.createElement('tr');
        tr.setAttribute('aria-selected', String(row.id === selected));
        const date = new Date(row.timestamp * 1000);
        const timestamp = document.createElement('td');
        const time = document.createElement('time');
        time.dateTime = date.toISOString();
        time.title = date.toLocaleString();
        time.append(document.createTextNode(date.toLocaleDateString()), document.createElement('br'), document.createTextNode(date.toLocaleTimeString()));
        timestamp.append(time);
        tr.append(timestamp);
        for (const text of [row.project, row.error || row.validator]) {
            const td = document.createElement('td');
            td.textContent = text;
            td.title = text;
            tr.append(td);
        }
        if (row.evaluationIndex >= 0) {
            tr.dataset.id = row.id;
            tr.tabIndex = 0;
            tr.title = 'Load captured arguments';
            const select = () => {
                if (busy) return;
                selected = row.id;
                vscode.postMessage({kind:'select', id:row.id});
            };
            tr.onclick = select;
            tr.onkeydown = event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
            };
        }
        body.append(tr);
        if (focused === row.id) tr.focus({preventScroll:true});
    }
});
vscode.postMessage({kind:'ready'});
</script></body></html>`
}
