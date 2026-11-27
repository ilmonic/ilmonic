---
id: ocrMuzprBBaR
name: Video Reference
version: 1.0.0
author: ilmon
description: very cool video template reference
contract: 3
filename: |
  {{ zt.title | default: zt.key | replace: '/', '-' | replace: ':', ' -' | replace: '?', '' | replace: '|', '-' | truncate: 90, '' }}{% suffix %}
language: liquid
frontmatter:
  - key: fullTitle
    expr: zt.title
    merge: replace
  - key: arabicTitle
    expr: zt.extra.raw
    merge: replace
  - key: speaker
    expr: '"[[Marājiʿ/" | append: zt.authorsShort | append: "|" | append: zt.authorsShort | append: "]]"'
    merge: replace
  - key: url
    expr: zt.url
    merge: replace
  - key: published
    expr: 'zt.date | date: "%Y-%m-%d"'
  - key: tags
    expr: '"noteType/reference,subjectType/" | append: zt.itemType | split: ","'
  - key: rating
    value:
      $eval: "3"
match: {"and":["itemType == \"videoRecording\""]}
---
# {{ zt.title }}

[Zotero]({{ zt.backlink }}) {{ zt.attachments | map: "fileLink" | compact | join: " " }}

## Annotations

```zotquery
views:
  - type: annotations
    name: Annotations
    from: annotations
    filters: item == this.item
    sort:
      - property: attachment.dateAdded
        direction: ASC
      - property: sortIndex
        direction: ASC
```


--- zotlit:annotation ---
{%- assign head = zt.text | slice: 0, 20 -%}
{%- assign link = "" -%}
{%- if head contains "(" and head contains " - " -%}
  {%- assign stamp = head | split: " - " | last | split: ")" | first | strip -%}
  {%- assign p = stamp | split: ":" -%}
  {%- if p.size == 3 -%}
    {%- assign h = p[0] | times: 3600 -%}
    {%- assign m = p[1] | times: 60 -%}
    {%- assign secs = h | plus: m | plus: p[2] -%}
  {%- else -%}
    {%- assign m = p[0] | times: 60 -%}
    {%- assign secs = m | plus: p[1] -%}
  {%- endif -%}
  {%- capture link %} [▶ {{ stamp }}]({{ zt.parentItem.url }}&t={{ secs }}){% endcapture -%}
{%- endif -%}
{% bq %}
[!note] [Zotero]({{ zt.backlink }}){{ link }}

{{ zt.imgLink | embed }}{{ zt.text }}
{% if zt.comment %}

{{ zt.comment }}
{% endif %}
{% endbq %}