"""Rebuild the pipeline launcher while retaining the proven H3 install cells."""
import copy
import json
import re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
notebook=copy.deepcopy(json.loads((root/'MiniMax_Studio_Colab.ipynb').read_text()))
notebook['cells'][0]['source']=['# Drama Pipeline — Colab GPU worker\n','\n','Run all to connect your GPU to the private Cloudflare studio. The runtime consumes Colab compute units while allocated. No paid LLM inference API is used.\n','\n','Before running, add STUDIO_URL, GPU_KEY and your model-download HF_TOKEN in Colab Secrets (key icon in the left sidebar), granting notebook access. Never put credentials in cells or chat.\n','\n','Initial evaluation: use G4 and Qwen3.6-27B. Choose the smaller Qwen3.5-9B in the last cell if needed. Actual GPU quality/performance, voice calibration and continuity evaluation are still pending.\n','\n','Finish with **Runtime → Disconnect and delete runtime**. The worker also deletes the runtime after its idle timeout.\n']
for cell in notebook['cells']:
 cell['source']=[line.replace('BRANCH = "main"','BRANCH = "drama-pipeline"') for line in cell.get('source',[])]
 if cell.get('cell_type')=='code':cell['execution_count']=None;cell['outputs']=[]
notebook['cells'][7]['source']=(root/'gpu/python/colab_launch.py').read_text().splitlines(keepends=True)
# The pipeline keeps media in R2, so the studio's Google Drive cell only adds a permission prompt to Run all.
del notebook['cells'][2]
for number,cell in enumerate(notebook['cells'][1:],1):
 cell['source']=[re.sub(r'^#@title \d+\.','#@title %d.'%number,line) for line in cell['source']]
(root/'Drama_Pipeline_Colab.ipynb').write_text(json.dumps(notebook,indent=1,ensure_ascii=False)+'\n')
