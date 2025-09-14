<!-- BEGIN ARISE ------------------------------
Title:: "Let's remember the good old patchs"

Author:: "Dr. Schlange"
Description:: "Patch management, memory management, versioning and opportunities"
Language:: "en"
Published Date:: "2025-09-14"
Modified Date:: "2025-09-14"

---- END ARISE \\ DO NOT MODIFY THIS LINE ---->

# Let's remember the good old patchs

I'm sure you all have your way of handling your patch with your musical software. You probably have a folder somewhere where all the files are carefully labeled, with the perfect name. Perhaps you added a date, perhaps you added a version. Let's review what's reality, how things happens for people that are not extremely organized (like me), or who consider different ways of organizing data, and how Nallely now gets a very simple memory abstraction to store patches that unleashes unspeakable power.

## Time for a story

Files and especially file names drags a lot of semantic and their use changes with time. Let me tell you the story of your patch file.

When your patch is still a work in progress, your file is a snapshot of your full patch to be sure that if you tried something and you don't like the result, there is at least this moment where you know that you were on the safe spot. This gives you a sense of stability, safety, like a nice hot soft blanket that would whisper to you: "all is fine, go crazy, experiment" (this is pure blanket talk). Then you reach a good point. You feel you want to keep this patch for later, to keep it as a memory of what you did, a memory of some nice patterns between modules, so you give it a name, a path, you label it. And the label is perfect, great name, amazing name, the date, perhaps even a version number.

But... what happens when you go back? Do you remember exactly what was this patch about just with the name? That's not a huge deal though, let's continue the story. You come back on your patch session. You closed your software few days, weeks before, so nothing is in memory, you want to rehydrate your patch. You open it, make some modifications, then save it. All good? Are you sure? Did you change the date you put in the patch file name? Did you update the version number. What are you doing with all the versions that you have on your disk (if you have saved them)? When you wantn to come back to a previous version, you're loading the version in question, if it exists... did you forget to update the name? Did you loose your previous version?

I guess a lot of people are extremely careful with that, but that's honestly something that slips out of mind quite easily doesn't it. Don't lie, you know it's true, it already has happened to you, perhaps not today, but it did. You clicked, then felt a cold contraction running through your spine, and heard your brain hyperventilating telling you: "fuck, you saved the patch in the wrong file, you overrided the version you were saving...". You `ctrl-z` like crazy, but not all software supports it, and you patched a lot of things, you don't know where to stop exactly to revert well, you're not even sure the modification stack is deep enough to have kept in memory all you did.

Let's put on the side this issue. Let's assume you never had it. Now, you want to distribute a patch to another machine, you want to collaborate on a patch with someone, how can you do that? Ok, patch collaboration is perhaps not a classical use case, but that might happens. What you'll do is to send files here and there by email, on transport them on USB keys. We all have tricks to share information.

All of this, is only for a patch: for a specific configuration of your running system. Can we do better?

## Patch serialization as pure file: problems

As you saw, a file do not only carry your actual patch that can be reloaded, it's more than that. For a while, a patch is a temporary container that will represent the patch in construction. Even if those intermediate versions are not that important, they can be a good come back point sometimes if you feel you reached at some point a good stable point. Once the patch is finished, the patch name becomes the pure label that will pinpoint in time the fact that the patch is stable at this point and that it is the version you want to reload. Then if you iterate on the patch and create new version, the name will reflect that and you'll have a version encoded in the file name. This would looks like `Spacial-25/09/14-A` if you are organized.

Here how looks mines: `_TRI-0001-0002`, where `_TRI` is supposed to be an indicator about the number of MIDI devices that are impacted by the patch (here 3), then the numero of the session, then each sub-version for the session. I'm using Nallely almost daily to see how I can improve the UI and the UX to have something that feels easy to use, at least as a first step to reach a better UI. Consequently, I have a lot, like a loooot of files here and there. At the moment, they are all scattered through the file system in various places. They have pretty inconsistent naming, it's not easy to browse all of them and to remember what each is doing when I need to reload a previous patch. I guess the problem is me, I can definitely hear that. Honestly, I think it's also the fact that, only a file name... it's not enough. Nallely needs something else to easily manage the save/reload of patchs without having to rely on file names directly.

## Memory cells to help

All those files are memories: they are memories of past sessions, memories about past experimentations. They are just a piece of gear for the software, but conceptually, they are part of what the software is able to remember. So, instead of considering the files as, well, a file on the file system, we would consider them as memory cells.

What would change for Nallely? It means that Nallely would read and write at addresses instead of file names. It means that the memory could be placed on the file system somewhere to a specific location to persist. It means also that a memory doesn't have to be only about the patch, it can embedd more things, extra files, meta information, etc. This gives a lot of flexibilities without having to remember a file name and a convension. Instead, we would have a lot of addresses that can be represented visually on a line, or on a grid and instead of having only information about the name, you'll have spatial information. The patch would be displayed to an absolute position in a grid, which would make it a little bit easier to pick or to identify quickly, and as we have meta information, we can imagine more.

So, what coul we use for that? Technically, Nallely's patches are store in the files as JSON. We could use a database to store the session to a specific address, and with that, we win a lot compared to have a simple file. We can query the session with DB queries over JSON fields, etc. But what about schema migration? While there is a lot of tools and libraries that helps to deal with schema migration, it's still a little bit heavy, and we have to setup a database. That's not the best even if that would give a lot of flexibility.

So what's the best we can have keeping simplicity of use, but also adding versioning and possibilities to have more semantic when we manage the patches?

## Memory cells as file with git

Beside database, the other alternative solution is simple: let's stick with files... Yes, but not only files, let's stick with files where we, as a user, we don't handle the location on the file system, where we are sure we can version them automatically, we can browse the versions, we can synchronize them, etc. To sum up, let's use git!

Git is a marvelous piece of software, and here it ticks all the cases that we want:

* we have a traceability of each versions with date, modified files,
* we can identify the author,
* we can embedd meta information in the commit comment.

Git brings even more power:

* we can have branches,
* we can have tags,
* we can come back to any version in time,
* we can analyze the tags
* we can sync git repositories with remote repositories.

Also, do you remember that Nallely stores patches in files as JSON? Well, we can even then unleash semantic diffs between commits. That's a huge win!

We clear the versioning problem, but what about the file names? We still need names for the patches. This is where the memory analogy becomes handy. If we don't have to handle the file names ourselves, be we just need to have a way of representing the addresses on the file system. This way, as a user, we can just read/write to an address. That's that simple. Of course, this means also that we will need a nice way to represent the memory from the UI to manage the memory (read/write/clear/copy/paste/more?).

## Manage memory from TrevorUI

To represent the memory view, a simple grid is used. It's currently enough and gives flexibility to select an address as a pointer to an address in which we will be able to save quickly a session. We can also save the current session to a specific address, and reload a specific address. A question that you probably already have is "what's in my patch"? What did I put in this specific file? That's where the label that you manually put is not enough, and where the addresses are not helping that much. To overcome that, when an address is selected in the interface, Nallely fetches informations about the session and display them to you. As we are using a git repository, then, each "save" triggers a commit on the git repository. This means that all the modifications we made are not versioned, the version is saved, and we can come back to this version any time we want!


You can see that with this spacial representation, it becomes easy to clusterize yourselves the area of the memory that you want to use for a dedicated experimentation, or patchs that are related in ideas. This interface is currently only a first version, newer version will add more information, the possibility to browse the versions of an address, and to rehydrate them.


## Memory cell <-> file system mapping

Relying on a git repository for handle the memory cells means that we need to map an address to the file system. The convention that is currently applied in Nallely is quite simple: the address `0xABCD` is mapped to `memory/AB/CD.nly`. That limits a little bit the number of files by directory that are written when a patch is saved.

The created file `AB/CD.nly` is only created if the patch is saved. If nothing is saved, the file is not written. Here is how the git repository looks like with a bunch of session saved at different addresses:

```bash
$ tree memory/
memory/
├── 00
│   ├── 00.nly
│   ├── 02.nly
│   ├── 2A.nly
│   ├── 2D.nly
│   ├── 2E.nly
│   └── 51.nly
├── 02
│   ├── 88.nly
│   └── DD.nly
└── 03
    ├── AB.nly
    └── DD.nly

4 directories, 10 files
```

Each of the `XX.nly` file contains the full session saved at this address in a JSON format. Having JSON is practical for many reasons, but more than anything, it means that relying on git and human-readeable file format. If we need to update/modify or handle those files with any other tool, we can do it directly with a file editor, or use more advanced tools. We are free of managing everything outside of Nallely if something goes wrong, and we have all the versions if we need to revert to a previous version of a patch.

All of this is awesome, but we still need to have git installed... This is were the beauty lies, we don't. Not directly in a sense. Nallely is using [`Dulwich`](https://github.com/jelmer/dulwich/) an awesome library that is a reimplementation of git in pure Python. This means that Nallely doesn't need `git` installed on your system! Cherry on the cake, as Dulwich is written in pure Python, it's compatible Linux, MacOS and Windows.

## In the near future

So, do we just made our life more complicated, or did we unlock new capabilities? Well, we unlocked a lot! We can think now of Nallely's memory as something that is shareable, versioned and that we can "fix" if there is problematic patches! Let's explore some ideas:

### Come back in history and semantic diff

As each save of a session creates a commit, it means that we can come back to any previous version of your session and of your patch. That's already pretty neat in itself, but we can go further.

As we store the information as JSON, we can use then tools like [`DeepDiff`](https://github.com/seperman/deepdiff) that is able to take 2 versions of dict structure and compare them, giving back as information the elements that have move, the one that have been modified and how (addition, suppression, changes). This goes more far away than the simple syntax diff, we have a clear view of the elements that have changes in the JSON and how instead of having a `+-` related to lines and chars. That's also possible as Nallely saves unique ID for the each of the devices in the session and tries to enforce the load order. Consequently, tools like `DeepDiff` works well and can quickly map the elements between the different versions.

What can we do with that? With a semantic diff, it means that we gain a fine grain knowledge over the way the elements evolves between the snapshots. We can replay them, we can write lists of delta commands, we could transmitt them to another remote Nallely session from which we would have started to branch with another running session, then synchronize them, ... This definitely brings a lot of new possibilies when it comes to manipulate time and history in a way!

### Branches for alternative memory

With git, we gain branches, this means that we are able to branch from a point of the memory to bring it somewhere else, while still being able to come back to the point where we branched, to make it evolved on its own way, they to reconcilliate later.

This could lead to have different layers that could have different meanings. One pure clean branch for representations or where you don't want to have and see all the experiments you did, while keeping on another branch experimentations and tries. You could then migrate some of the patches from the experimental branch towards the main one, still keeping the versions, history and all git is giving you!

### Tags your most stable patches

Git lets you tag some versions, it means that you can put a label, one that you decide, not an address, to a specific address. That helps to tell in history what version you consider is the most iconic and is worth going back to. That's a good way to remember well some patches, to come back to them. With that, we are a little bit in the idea of keeping labels as you would do in the file name. However, this time, it's versioned, and it's only something that is handled for many sessions at once in the memory. No need to handle a lot of files per directory, or to have to find back which ones are related to the same patch.

### Share your memory

Git is not only made to have a local versioned repository of your files (and your Nallely's memory), but to also be distributed. With the memory setup as a git repository, we can push the modifications to other machines, we can host them online, we can share them, collaborate, ... We could even discover memories that have been made public and load them, play with them and distribute them. This way, we can also migrate easily our Nallely memory to another device! Think that you have a session that you want to push to another machine, or that you need to migrate from your old raspberry pi to your new shinny new raspberry pi version without loosing what you had. No need to copy files, you can just setup your memory to point to your github repository where everything is synced, push from your old RPI and pull from your new RPI.

## Conclusion

Considering Nallely "memory" as a git repository to save the different sessions while not having to handle files manually is a big shift in Nallely's capabilities. Not only in the new features that this will bring in the future, but also in the mental model that is applied. A memory git repository is the embryo of a new way of handling sessions in Nallely. As we have a git repository located to a specific location that will embedd the sessions of this memory, we can also think about a way to store other informations in the memory, as new Python virtual devices, for example. This will definitely help with going further and forward to create virtual devices directly in TrevorUI. Think about a small laboratory to quickly create and prototype new virtual devices, from the interface, without the need to stop/restart the session. I'm brainstorming in a way to help bootstrap that from the interface where it will be possible to declare the different ports, the modules, and get a first auto-generated skeleton already able to work in the session. This is made possible thanks to a set of [refinements over the internal API](https://github.com/dr-schlange/nallely-midi/issues/12). However, this is another story.