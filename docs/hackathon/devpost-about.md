# About GoToTheArchive

## Inspiration

Context is probably the biggest problem with agents right now. Everyone is racing to make agents remember more about you, and that memory ends up sitting in a database or a hosted service you never see. You can't look at it, edit it, or decide what shows up for a given task.

Context is also only the first layer. The thing underneath it is taste, the judgment behind what you save, what you throw out, and what you keep sending back for another try. An agent that works the way you want needs that, and it should not be quietly building its own version of it in the background.

So the idea was simple. Your agents should not each own a hidden model of you. You own the Archive, and you decide what any agent gets, one task at a time.

## What it does

The Archive is a plain visual space for your images, links, documents, notes, and past work. It is useful on its own, with no agent connected.

When you want an agent to help, you pick what it can see, add to, or edit for that task. WebMCP turns those choices straight into the agent's real tools. What it can call, and which regions it can reach inside each call, is exactly what you have granted at that moment. Pull an access and the tools change with it, enforced on the server, not just redrawn in the interface.

The agent works from what you allowed and returns its result to the Workbench as a version you can review. You see what it looked at, what actually shaped the output, and who made it. You annotate it, approve it, send it back, or ask for another pass. If it built a component, it runs live so you can click through it. From your feedback it can propose a taste signal tied to the exact notes behind it, and nothing gets kept until you say so.

## How I built it

The build restarted more than once. Every time I laid out the full scope, an agent talked me into cutting something load-bearing because it looked too ambitious. The scope was fine. The restarts were the problem. Once I locked it to Archive, Workbench, and Taste and stopped reopening that, it moved.

It runs on Cloudflare, with one database object holding everything. That is a real constraint, but it also means several people and their agents hitting the same Archive at once stay consistent with no extra work.

Retrieval was a decision point. The easy path was a managed search service, but that hides the permission model in a box I don't control, and its indexing lags, which breaks the whole point of flipping a lock and having the next call fail. So retrieval runs directly on the database, filtering by permission before it ranks anything. Something you can't see is gone from the results, not sitting there with a low score.

The part I got most wrong was taste. I built it server-side first. It grouped your notes by topic and wrote the preference sentence from a template, and the output was things like "Leans away from the current typography on posters." Vague, and the kind of background guessing I started this project to get away from. So I deleted it. Now a taste signal exists only because an agent read your feedback and named the pattern with evidence, or because you wrote it yourself. The server just keeps that evidence honest when you edit a note later.

Partway through I ran the whole thing through an outside WebMCP audit and fixed what it flagged, mostly around when tools register and how their descriptions read.

## Challenges

Making permissions real everywhere at once. The interface, the agent's tools, retrieval, and the server all had to agree, including in the second right after you revoke something.

Multimodal context. Images are how people actually communicate taste, but WebMCP is mostly shaped around JSON. I had to bring media in safely, keep the original separate from anything derived from it, and track where every derived detail came from.

Revocation going deep enough. A taste signal is a compressed version of the material behind it, so revoking a folder has to pull the preference it taught, not just the folder's items.

## What I learned

WebMCP can be more than a cleaner way for agents to operate a site. The page itself can be the control surface you and the agent share, where organizing your work and setting the agent's boundary are the same action.

A schema is fine for stating authority but it cannot enforce it, so the check has to run on every call. And people need to see what shaped a result, not just what the agent opened.

## What's next

Better handling of PDFs and slides, more ways to bring context in, exports so the Archive is portable, and real collaboration between people through shared spaces.

The goal does not change. Your agent should not own a hidden model of you. You own the Archive.
