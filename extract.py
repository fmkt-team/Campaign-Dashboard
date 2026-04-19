import zipfile
import xml.etree.ElementTree as ET

docx=zipfile.ZipFile('campaign_dashboard_PRD.docx')
tree=ET.XML(docx.read('word/document.xml'))
text = '\n'.join(''.join(n.text for n in e.iter() if n.tag.endswith('}t') and n.text) for e in tree.iter() if e.tag.endswith('}p') and any(n.text for n in e.iter() if n.tag.endswith('}t') and n.text))

with open('doc_text.txt', 'w', encoding='utf-8') as f:
    f.write(text)
