# FSN // File System Navigator

> Fly through your files.

A web reimagining of Silicon Graphics' legendary **FSN (File System
Navigator)**: directories become pedestals, files become towers, and the file
system hierarchy turns into a navigable 3D landscape.

![FSN in action](docs/fsn-screenshot.png)

## About the project

The original FSN was an SGI experiment that explored navigation through
“information landscapes.” It was immortalized in *Jurassic Park* during the
“It's a Unix system” scene.

This project brings that idea to the browser with a modern interface while
preserving the visual language of 1990s IRIX workstations:

- magenta pedestals represent directories;
- pedestal height reflects the directory's total size;
- towers represent files, with height reflecting file size;
- tower color indicates file age;
- flat icons identify file types;
- directory names appear in green near the ground;
- glowing wires show relationships between directories.

## Privacy

The browser may use “upload” terminology in its folder picker, but FSN **does
not send files to any server**.

Only local metadata is read:

- file name and relative path;
- size;
- MIME type;
- last modified date.

Indexing is limited to 500 files to preserve stability in embedded browsers.
Data remains only in the page's memory and disappears when the page is
reloaded.

## Controls

| Action | Control |
| --- | --- |
| Orbit the camera | Drag |
| Zoom in or out | Scroll |
| Select an object | Click |
| Enter a directory | Double-click |
| Move up one level | `Esc` or `Backspace` |
| Open help | `H` |

Files can also be located quickly, and the scene can be reorganized by size,
name, or age.

## Running locally

Requires Node.js `>=22.13.0`.

```bash
git clone https://github.com/rafaehlers/fsn.git
cd fsn
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To validate the production build:

```bash
npm run build
```

## Technologies

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Three.js](https://threejs.org/)
- [vinext](https://github.com/cloudflare/vinext)
- TypeScript and CSS

## Inspiration and references

- [The original FSN — archived Silicon Graphics page](https://archive.irixnet.org/siliconsurf/free/cool_sw_01.html)
- [Jurassic Park computers in excruciating detail — Fabien Sanglard](https://fabiensanglard.net/jurrasic_park_computers/index.html)
- [File System Visualizer — Wikipedia](https://en.wikipedia.org/wiki/File_System_Visualizer)
- [fsv — an open-source FSN clone for Unix systems](https://fsv.sourceforge.net/)

Fabien Sanglard's article was the spark for this project. In addition to
documenting the computers used in *Jurassic Park* in extraordinary detail, it
shows how FSN was used on Dennis Nedry's SGI Crimson to navigate the `/usr`
directory.

## Status

This is a visual experiment and is not intended to replace the operating
system's file manager — the same spirit declared by SGI for the original FSN.

---

This is an independent project with no affiliation with Silicon Graphics,
Universal Pictures, or the authors of the references above.
