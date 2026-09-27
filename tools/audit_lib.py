import re, collections
from translate import norm, strip_pre

def close(t, s):
    ks = set(strip_pre(norm(t))); ss = {norm(x).strip() for x in re.split(r'[-/()،,\s]+', s) if x}
    return any(k in x or x in k for k in ks for x in ss if len(x) >= 2)

def far_signs(plan):
    """إشارات اسمها لا يشبه الكلمة: من الجذر أو بديل بالمعنى — تحتاج عينًا بشرية"""
    return collections.Counter((p['text'], p['sign']) for p in plan if p['action'] == 'sign'
                               and str(p.get('how', '')).startswith('gemini') and not close(p['text'], p['sign']))
