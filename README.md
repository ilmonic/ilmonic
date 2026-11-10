# 1. Overview
The vault's entire existence serves an ecosystem for efficient and effective knowledge synthesis.
If at any point it failed to provide such, the vault's architecture demands urgent refactoring.
In this documentation, I present a snapshot the Ilmonic's architecture *(throughout its many needful evolutions)*. 

# 2. Objectives
The **synthesis** and **publish** of well established and insightful Islamic knowledge.

# 3. Principles

One principle that rules all else on Ilmon's Vault:
1. [**Notes Over App**](https://stephango.com/file-over-app), diligently advocated for by the owner of Obsidian, Kepano.

In working towards both objectives mentioned above, the notes will have to be:
2. **Low Entropy**: Streamlined, Unintimidating and Compelling*(synthesis objective)*
3. **Refined Candor**: Polished, Unvarnished and Visually-appealing *(publishing objective, this is purely for my own enjoyment)*

In the pursuit of the much anticipated *(yet somehow sudden)* epiphanies there must be a reliable system to follow. I will of course outsource the thinking on that to:
4. **Luhman's Zettlekasten System**: Implying three types of notes *(fleeting `Masūdāt`, literature `Mudawwanāt` and permanent)*, a system that proves itself over and over again.

And to fulfill the publishing criteria, as well as the credibility for my own most often lacking speech:
5. **Traceability**: All claims are referenced and instantly clearly verifiable. With "**References**" having their own established ecosystems *(`Marājiʿ`)*.

And most definitely:
6. NO ARTIFICIAL INTELLEGENCE. ALL BY THE HANDS AND THROUGH THE CONTEMPLATION OF A RAW HUMAN :D
Although I might ironically feed it.
# 4. Structure

The first Principle above underlines the dispensability of folder structure.
That is ONLY serving as a navigational anchor *(as well as cool factor, very important)*

> **THE EVERGREENS ARE IN THE ROOT.**

| Folder        | Arabic | Meaning         | Holds                                                                                                                              |
| ------------- | ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Arkhīf/`     | أرشيف  | archive         | Everything that is not a note. Contains `Murfaqāt/`, `Qawālib/`, `Sijillāt/` and `Lawḥāt/`                                         |
| `Marājiʿ/`    | مراجع  | references      | Markdown notes about one specific thing, person, or domain                                                                         |
| `Mudawwanāt/` | مدونات | written records | Markdown notes of type `literature`, with their own template. Permanent notes are not here, they live in the root                  |
| `Masūdāt/`    | مسودات | drafts          | Unpublished *(gitignored)*, unfinished writing. No template, no required references. Promoted to the root *(permanent)* or deleted |

*`Arkhīf`* contains all that's excluded from search. But serves in the creation *(`Qawālib`)*, querying *(`Sijillāt`)* and organizations *(`Lawḥāt`)* of the notes and their references.

| Subfolder          | Arabic | Meaning     | Holds                                                                         |
| ------------------ | ------ | ----------- | ----------------------------------------------------------------------------- |
| `Arkhīf/Murfaqāt/` | مرفقات | attachments | Anything embedded in a note that is not a note: images, voice notes, drawings |
| `Arkhīf/Qawālib/`  | قوالب  | templates   | The Templates plugin's source folder. Holds no vault content                  |
| `Arkhīf/Sijillāt/` | سجلات  | records     | The Obsidian bases  *(`.base` files)*                                         |
| `Arkhīf/Lawḥāt/`   | لوحات  | boards      | The Obsidian canvases  *(`.canvas` files)*                                    |

With `Marājiʿ/` being the only folder composed of **sub-folders** *(for the better management of referencing types as well as their re-occurrence possibility).

| Subfolder          | Arabic | Meaning           |
| ------------------ | ------ | ----------------- |
| `Marājiʿ/Aʿmāl/`   | أعمال  | authored works    |
| `Marājiʿ/ʿUlamāʾ/` | علماء  | thinkers          |
| `Marājiʿ/ʿUlūm/`   | علوم   | fields of inquiry |

# 5. Relations
This diagram outlines how all of the vault centers around the building of insights.

![[Arkhīf/Lawḥāt/11062026 - Ilmon'sVaultStructure.canvas]]

#  6. Workflow

## Reading Workflow
I spent way too much time contemplating the flow of reading, one of the most straightforward actions to ever be, if not the agonizing tradeoff between the reading of:
1. The original Arabic where you tap into the Author's own raw articulation and choice of words in his depiction of his thoughts. An advantage I will murder people for :D 
2. The translated English where I find easy to follow shapes of arguments obliged by the childlike unsophistication of the almighty English language.

| Comparison | English                                                                                                                                | Arabic                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Good       | Easy to follow and thus faster reading, Ready made scholarly translation with correct terminologies, Instant conversions unto content. | The absolutely definition of a mind-boggling yet elegant perfection.   |
| Bad        | Foreign unwelcomed intermediation in my understanding of the author's intended meaning (lost/added meaning)                            | More work and will check the translations either ways *(for content)*. |

After spending this initial week *(Nov 1-6th)* sparsely thinking about it. The final version of the flow would be:
1. I read original for my own utter amusement and self-actualization :D
2. I take janky notes in English for what I think with no interventions from translations *(it's weird but reading translations affect how I initially thought about the original text which I despise)*
The first two steps enclose the "Reading"/"Capturing" process. But reading as an action doesn't end here.
3. Once starting to "Organize" *(the next step of [[CODE]])*, I will be **coupling** the citations in Arabic to their place in the English citation on Zotero, as well as refine the notes previously taken.
The organization on step 3 allows for a **grappling** with earlier insights, an immaculate stepping stone for step 4.
4. "Distillation" of the chapter unto a literature notes.
5. "Expression" will then proceed with a translation into a visual medium.

How elegant is that?

## Writing Workflow

Haven't wrote much, don't know much.

## Production Workflow

Never done anything yet...

