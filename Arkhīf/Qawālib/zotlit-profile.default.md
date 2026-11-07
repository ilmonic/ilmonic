---
id: default
name: Qālib Muʾallafāt
version: '1.1'
author: Ilmon
description: The Qālib for Muʾallafāt
contract: 3
filename: |
  {{ zt.shortTitle | default: zt.citationKey | default: zt.key }}{% suffix %}
language: liquid
frontmatter:
  - key: fullTitle
    expr: zt.title
  - key: arabicTitle
    expr: zt.extra.raw
  - key: Author
    expr: '"[[Marājiʿ/Mufakkirūn/" | append: zt.authorsShort | append: "|" | append: zt.authorsShort | append: "]]"'
  - key: Publisher
    expr: zt.publisher
  - key: noteType
    expr: '"#type/" | append: zt.itemType'
  - key: noteCreation
    expr: '"now" | date: "%Y-%m-%d"'
---
# [Annotations]({{ zt.backlink }})

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
{% bq %}
[!note] {% if zt.pageLabel and zt.pageLabel != "" %}Page [{{ zt.pageLabel }}]({{ zt.backlink }}){% else %}[Zotero]({{ zt.backlink }}){% endif %}

{{ zt.imgLink | embed }}{{ zt.text }}{% if zt.citation %} {{ zt.citation }}{% endif %}
{% if zt.comment %}

{{ zt.comment }}
{% endif %}
{% endbq %}
