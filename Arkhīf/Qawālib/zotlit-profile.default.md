---
id: default
name: Qālib Muʾallafāt
version: '1.2'
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
    expr: "zt.extra.raw"
  - key: author
    expr: '"[[Marājiʿ/ʿUlamāʾ/" | append: zt.authorsShort | append: "|" | append: zt.authorsShort | append: "]]"'
  - key: publisher
    expr: zt.publisher
  - key: tags
    expr: '"#type/" | append: zt.itemType'
  - key: rating
    value: {"$eval":"3"}
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
[!Quote] [[Marājiʿ/Aʿmāl/{{ zt.parentItem.shortTitle }}|{{ zt.parentItem.shortTitle }}]] {% if zt.pageLabel and zt.pageLabel != "" %}Page [{{ zt.pageLabel }}]({{ zt.backlink }}){% else %}[Zotero]({{ zt.backlink }}){% endif %}

{{ zt.imgLink | embed }}{{ zt.text }}{% if zt.citation %} {{ zt.citation }}{% endif %}
{% if zt.comment %}

{{ zt.comment }}
{% endif %}
{% endbq %}