"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type NodeKind = "directory" | "file";

type FsNode = {
  id: string;
  name: string;
  kind: NodeKind;
  size: number;
  modified: number;
  mime?: string;
  parentId?: string;
  children?: FsNode[];
};

type SortMode = "size" | "name" | "age";

type BrowserDirectoryHandle = {
  name: string;
  values: () => AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
};

type BrowserFileHandle = {
  name: string;
  getFile: () => Promise<File>;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
  }
}

const DAY = 86_400_000;

const demoTree: FsNode = {
  id: "demo",
  name: "Macintosh HD",
  kind: "directory",
  size: 18_730_000_000,
  modified: Date.now(),
  children: [
    {
      id: "demo/work",
      parentId: "demo",
      name: "Work",
      kind: "directory",
      size: 7_420_000_000,
      modified: Date.now() - DAY,
      children: [
        { id: "demo/work/fsn", parentId: "demo/work", name: "FSN", kind: "directory", size: 3_100_000_000, modified: Date.now() - DAY * 2, children: [] },
        { id: "demo/work/archive", parentId: "demo/work", name: "Archive", kind: "directory", size: 2_600_000_000, modified: Date.now() - DAY * 24, children: [] },
        { id: "demo/work/notes.md", parentId: "demo/work", name: "notes.md", kind: "file", size: 740_000, modified: Date.now() - DAY, mime: "text/markdown" },
      ],
    },
    {
      id: "demo/media",
      parentId: "demo",
      name: "Media",
      kind: "directory",
      size: 5_880_000_000,
      modified: Date.now() - DAY * 5,
      children: [
        { id: "demo/media/video", parentId: "demo/media", name: "Video", kind: "directory", size: 4_500_000_000, modified: Date.now() - DAY * 7, children: [] },
        { id: "demo/media/audio", parentId: "demo/media", name: "Audio", kind: "directory", size: 1_380_000_000, modified: Date.now() - DAY * 12, children: [] },
      ],
    },
    {
      id: "demo/code",
      parentId: "demo",
      name: "Code",
      kind: "directory",
      size: 3_920_000_000,
      modified: Date.now() - DAY * 3,
      children: [
        { id: "demo/code/src", parentId: "demo/code", name: "src", kind: "directory", size: 1_900_000_000, modified: Date.now() - DAY, children: [] },
        { id: "demo/code/node_modules", parentId: "demo/code", name: "node_modules", kind: "directory", size: 1_700_000_000, modified: Date.now() - DAY * 4, children: [] },
        { id: "demo/code/package.json", parentId: "demo/code", name: "package.json", kind: "file", size: 12_600, modified: Date.now() - DAY, mime: "application/json" },
      ],
    },
    { id: "demo/documents", parentId: "demo", name: "Documents", kind: "directory", size: 1_120_000_000, modified: Date.now() - DAY * 14, children: [] },
    { id: "demo/readme", parentId: "demo", name: "README.txt", kind: "file", size: 38_200, modified: Date.now() - DAY * 2, mime: "text/plain" },
    { id: "demo/disk", parentId: "demo", name: "system.img", kind: "file", size: 390_000_000, modified: Date.now() - DAY * 36, mime: "application/octet-stream" },
    { id: "demo/photo", parentId: "demo", name: "jurassic-park.jpg", kind: "file", size: 8_700_000, modified: Date.now() - DAY * 120, mime: "image/jpeg" },
  ],
};

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function relativeAge(timestamp: number) {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / DAY));
  if (days === 0) return "hoje";
  if (days === 1) return "há 1 dia";
  if (days < 30) return `há ${days} dias`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} anos`;
}

function findNode(root: FsNode, id: string): FsNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = child.kind === "directory" ? findNode(child, id) : undefined;
    if (found) return found;
  }
}

function findParent(root: FsNode, childId: string): FsNode | undefined {
  if (root.children?.some((child) => child.id === childId)) return root;
  for (const child of root.children ?? []) {
    if (child.kind === "directory") {
      const found = findParent(child, childId);
      if (found) return found;
    }
  }
}

function makeLabel(text: string, color = "#8ffcff") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "600 32px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillText(text.length > 24 ? `${text.slice(0, 22)}…` : text, 256, 55);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 1.5, 1);
  return sprite;
}

function ageColor(modified: number) {
  const days = Math.max(0, (Date.now() - modified) / DAY);
  if (days < 3) return new THREE.Color("#8ffcff");
  if (days < 30) return new THREE.Color("#4bd7ff");
  if (days < 180) return new THREE.Color("#6e8fff");
  return new THREE.Color("#b65cff");
}

async function scanDirectory(
  handle: BrowserDirectoryHandle,
  parentId: string | undefined,
  state: { count: number; maxEntries: number; maxDepth: number },
  depth = 0,
): Promise<FsNode> {
  const id = parentId ? `${parentId}/${handle.name}` : `local/${handle.name}`;
  const node: FsNode = {
    id,
    parentId,
    name: handle.name,
    kind: "directory",
    size: 0,
    modified: 0,
    children: [],
  };

  if (depth > state.maxDepth) return node;

  for await (const entry of handle.values()) {
    if (state.count >= state.maxEntries) break;
    state.count += 1;
    if ("getFile" in entry) {
      const file = await entry.getFile();
      node.children!.push({
        id: `${id}/${file.name}`,
        parentId: id,
        name: file.name,
        kind: "file",
        size: file.size,
        modified: file.lastModified || Date.now(),
        mime: file.type,
      });
    } else {
      node.children!.push(await scanDirectory(entry, id, state, depth + 1));
    }
  }

  node.size = node.children!.reduce((total, child) => total + child.size, 0);
  node.modified = node.children!.reduce((latest, child) => Math.max(latest, child.modified), 0) || Date.now();
  return node;
}

function filesToTree(files: File[]) {
  const rootName = files[0]?.webkitRelativePath.split("/")[0] || "Selected folder";
  const root: FsNode = {
    id: `local/${rootName}`,
    name: rootName,
    kind: "directory",
    size: 0,
    modified: Date.now(),
    children: [],
  };

  for (const file of files.slice(0, 600)) {
    const parts = (file.webkitRelativePath || file.name).split("/").filter(Boolean);
    let cursor = root;
    for (const segment of parts.slice(1, -1)) {
      let next = cursor.children!.find((child) => child.kind === "directory" && child.name === segment);
      if (!next) {
        next = {
          id: `${cursor.id}/${segment}`,
          parentId: cursor.id,
          name: segment,
          kind: "directory",
          size: 0,
          modified: file.lastModified,
          children: [],
        };
        cursor.children!.push(next);
      }
      cursor = next;
    }
    cursor.children!.push({
      id: `${cursor.id}/${file.name}`,
      parentId: cursor.id,
      name: file.name,
      kind: "file",
      size: file.size,
      modified: file.lastModified || Date.now(),
      mime: file.type,
    });
  }

  const sum = (node: FsNode): number => {
    if (node.kind === "file") return node.size;
    node.size = (node.children ?? []).reduce((total, child) => total + sum(child), 0);
    node.modified = (node.children ?? []).reduce((latest, child) => Math.max(latest, child.modified), 0) || Date.now();
    return node.size;
  };
  sum(root);
  return root;
}

export default function FsnNavigator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sceneApi = useRef<{ focus: (id: string) => void } | null>(null);
  const [root, setRoot] = useState<FsNode>(demoTree);
  const [currentId, setCurrentId] = useState(demoTree.id);
  const [selectedId, setSelectedId] = useState(demoTree.id);
  const [hoveredId, setHoveredId] = useState<string>();
  const [sortMode, setSortMode] = useState<SortMode>("size");
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("DEMO SCENE");
  const [search, setSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const current = findNode(root, currentId) ?? root;
  const selected = findNode(root, selectedId) ?? current;

  const breadcrumb = useMemo(() => {
    const result: FsNode[] = [];
    let cursor: FsNode | undefined = current;
    while (cursor) {
      result.unshift(cursor);
      cursor = cursor.parentId ? findNode(root, cursor.parentId) : undefined;
    }
    return result;
  }, [current, root]);

  const sortedChildren = useMemo(() => {
    const children = [...(current.children ?? [])];
    children.sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "age") return b.modified - a.modified;
      return b.size - a.size;
    });
    return children;
  }, [current, sortMode]);

  const counts = useMemo(() => ({
    directories: sortedChildren.filter((node) => node.kind === "directory").length,
    files: sortedChildren.filter((node) => node.kind === "file").length,
  }), [sortedChildren]);

  const openDirectory = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      inputRef.current?.click();
      return;
    }
    try {
      setIsScanning(true);
      setStatus("SCANNING…");
      const handle = await window.showDirectoryPicker();
      const tree = await scanDirectory(handle, undefined, { count: 0, maxEntries: 500, maxDepth: 5 });
      setRoot(tree);
      setCurrentId(tree.id);
      setSelectedId(tree.id);
      setStatus("LOCAL • READ ONLY");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setStatus("ACCESS ERROR");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const tree = filesToTree(files);
    setRoot(tree);
    setCurrentId(tree.id);
    setSelectedId(tree.id);
    setStatus("LOCAL • READ ONLY");
    event.target.value = "";
  };

  const enterNode = useCallback((node: FsNode) => {
    setSelectedId(node.id);
    if (node.kind === "directory") {
      setCurrentId(node.id);
      setHoveredId(undefined);
    }
  }, []);

  const goUp = useCallback(() => {
    const parent = findParent(root, currentId);
    if (parent) {
      setCurrentId(parent.id);
      setSelectedId(parent.id);
    }
  }, [currentId, root]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        if ((event.target as HTMLElement)?.tagName !== "INPUT") {
          event.preventDefault();
          goUp();
        }
      }
      if (event.key.toLowerCase() === "h") setHelpOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#031a18", 0.018);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    camera.position.set(0, 18, 28);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 8;
    controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.5, 0);

    scene.add(new THREE.HemisphereLight("#89ffe1", "#100018", 2.5));
    const key = new THREE.DirectionalLight("#ff4a8b", 4);
    key.position.set(-12, 20, 8);
    scene.add(key);

    const grid = new THREE.GridHelper(180, 90, "#00c9c2", "#07575a");
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.38;
    });
    scene.add(grid);

    const skyline = new THREE.Group();
    for (let i = 0; i < 36; i += 1) {
      const seed = ((i * 47) % 31) / 31;
      const geometry = new THREE.BoxGeometry(0.7 + seed * 1.6, 1.5 + seed * 7, 0.7 + seed * 1.6);
      const material = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? "#32143d" : "#072f36", wireframe: true, transparent: true, opacity: 0.36 });
      const building = new THREE.Mesh(geometry, material);
      const angle = (i / 36) * Math.PI * 2;
      const radius = 35 + (i % 5) * 5;
      building.position.set(Math.cos(angle) * radius, geometry.parameters.height / 2, Math.sin(angle) * radius);
      skyline.add(building);
    }
    scene.add(skyline);

    const group = new THREE.Group();
    group.scale.setScalar(0.82);
    group.position.y = -0.5;
    scene.add(group);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitObjects: THREE.Object3D[] = [];
    const objectById = new Map<string, THREE.Object3D>();
    const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

    const makeBox = (
      width: number,
      height: number,
      depth: number,
      color: string | THREE.Color,
      emissive: string,
      opacity = 1,
    ) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.24,
        roughness: 0.58,
        metalness: 0.18,
        transparent: opacity < 1,
        opacity,
      });
      disposables.push(geometry, material);
      return new THREE.Mesh(geometry, material);
    };

    const maxSize = Math.max(...sortedChildren.map((node) => node.size), 1);
    const directories = sortedChildren.filter((node) => node.kind === "directory").slice(0, 18);
    const files = sortedChildren.filter((node) => node.kind === "file").slice(0, 80);

    const stageHeight = 0.65 + Math.min(2.2, Math.log10(Math.max(current.size, 1)) / 5);
    const stage = makeBox(15, stageHeight, 11, "#c53c72", "#751037");
    stage.position.y = stageHeight / 2;
    group.add(stage);

    const stageOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(stage.geometry),
      new THREE.LineBasicMaterial({ color: "#ff83ad", transparent: true, opacity: 0.75 }),
    );
    disposables.push(stageOutline.geometry, stageOutline.material);
    stage.add(stageOutline);

    const title = makeLabel(current.name.toUpperCase(), "#ff9abb");
    title.position.set(0, stageHeight + 0.35, 6.3);
    group.add(title);
    disposables.push((title.material as THREE.SpriteMaterial).map!, title.material);

    const columns = Math.max(1, Math.ceil(Math.sqrt(files.length)));
    files.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const spacingX = Math.min(1.45, 11.5 / columns);
      const spacingZ = Math.min(1.45, 7.5 / Math.max(1, Math.ceil(files.length / columns)));
      const height = 0.42 + Math.max(0.25, (Math.log10(node.size + 10) / Math.log10(maxSize + 10)) * 3.7);
      const tower = makeBox(
        Math.max(0.35, spacingX * 0.62),
        height,
        Math.max(0.35, spacingZ * 0.62),
        ageColor(node.modified),
        "#006d83",
      );
      tower.position.set(
        (column - (columns - 1) / 2) * spacingX,
        stageHeight + height / 2,
        (row - Math.max(0, Math.ceil(files.length / columns) - 1) / 2) * spacingZ,
      );
      tower.userData.nodeId = node.id;
      tower.userData.kind = node.kind;
      group.add(tower);
      hitObjects.push(tower);
      objectById.set(node.id, tower);
    });

    directories.forEach((node, index) => {
      const angle = (index / Math.max(directories.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const radiusX = 18 + (index % 2) * 4;
      const radiusZ = 13 + (index % 3) * 2;
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;
      const normalized = Math.log10(node.size + 10) / Math.log10(maxSize + 10);
      const pedestalHeight = 0.8 + normalized * 3.2;
      const pedestal = makeBox(6.1, pedestalHeight, 4.4, "#b92e65", "#64102f");
      pedestal.position.set(x, pedestalHeight / 2, z);
      pedestal.userData.nodeId = node.id;
      pedestal.userData.kind = node.kind;
      group.add(pedestal);
      hitObjects.push(pedestal);
      objectById.set(node.id, pedestal);

      const label = makeLabel(node.name, "#7ffaf2");
      label.position.set(x, pedestalHeight + 1.0, z);
      label.scale.set(5.5, 1.05, 1);
      group.add(label);
      disposables.push((label.material as THREE.SpriteMaterial).map!, label.material);

      const childFiles = (node.children ?? []).filter((child) => child.kind === "file").slice(0, 14);
      childFiles.forEach((child, childIndex) => {
        const childHeight = 0.35 + Math.min(2.8, Math.log10(child.size + 10) / 2.8);
        const block = makeBox(0.55, childHeight, 0.55, ageColor(child.modified), "#005568");
        block.position.set(
          x + (childIndex % 5 - 2) * 0.85,
          pedestalHeight + childHeight / 2,
          z + (Math.floor(childIndex / 5) - 1) * 0.85,
        );
        block.userData.nodeId = node.id;
        block.userData.kind = "directory";
        group.add(block);
        hitObjects.push(block);
      });

      const points = [
        new THREE.Vector3(0, stageHeight * 0.55, 0),
        new THREE.Vector3(x * 0.48, Math.max(0.4, pedestalHeight * 0.6), z * 0.48),
        new THREE.Vector3(x, pedestalHeight * 0.55, z),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const wireGeometry = new THREE.TubeGeometry(curve, 24, 0.025, 5, false);
      const wireMaterial = new THREE.MeshBasicMaterial({ color: "#16e6d4", transparent: true, opacity: 0.68 });
      const wire = new THREE.Mesh(wireGeometry, wireMaterial);
      disposables.push(wireGeometry, wireMaterial);
      group.add(wire);
    });

    const focus = (id: string) => {
      const object = objectById.get(id);
      if (!object) return;
      const position = new THREE.Vector3();
      object.getWorldPosition(position);
      controls.target.lerp(position, 0.8);
    };
    sceneApi.current = { focus };

    let hoveredObject: THREE.Object3D | undefined;
    const setHoverMaterial = (object: THREE.Object3D | undefined, active: boolean) => {
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material?.emissive) return;
      material.emissiveIntensity = active ? 1.2 : 0.24;
      mesh.scale.setScalar(active ? 1.06 : 1);
    };

    const intersect = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(hitObjects, false)[0]?.object;
    };

    const onPointerMove = (event: PointerEvent) => {
      const object = intersect(event);
      if (object === hoveredObject) return;
      setHoverMaterial(hoveredObject, false);
      hoveredObject = object;
      setHoverMaterial(hoveredObject, true);
      canvas.style.cursor = object ? "pointer" : "grab";
      setHoveredId(object?.userData.nodeId);
    };

    const onDoubleClick = (event: MouseEvent) => {
      const object = intersect(event as PointerEvent);
      if (!object) return;
      const node = findNode(root, object.userData.nodeId);
      if (node) enterNode(node);
    };

    const onClick = (event: MouseEvent) => {
      const object = intersect(event as PointerEvent);
      if (!object) return;
      const node = findNode(root, object.userData.nodeId);
      if (node) {
        setSelectedId(node.id);
        focus(node.id);
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("click", onClick);

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      frame += 1;
      controls.update();
      group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.055);
      grid.position.z = (frame * 0.012) % 2;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("resize", resize);
      controls.dispose();
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      sceneApi.current = null;
    };
  }, [current, enterNode, root, sortedChildren]);

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const results: FsNode[] = [];
    const visit = (node: FsNode) => {
      if (node.name.toLowerCase().includes(query)) results.push(node);
      node.children?.forEach(visit);
    };
    visit(root);
    return results.slice(0, 6);
  }, [root, search]);

  const hovered = hoveredId ? findNode(root, hoveredId) : undefined;

  return (
    <main className="fsn-shell">
      <canvas ref={canvasRef} className="fsn-canvas" aria-label="Visualização tridimensional do diretório atual" />
      <div className="sky-glow" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" onClick={() => { setCurrentId(root.id); setSelectedId(root.id); }} aria-label="Voltar à raiz">
          <span className="brand-mark"><i>F</i></span>
          <span>
            <strong>FSN</strong>
            <small>FILE SYSTEM NAVIGATOR</small>
          </span>
        </button>
        <div className="system-flags">
          <span><i className="pulse-dot" /> {status}</span>
          <span className="hide-mobile">{counts.directories} DIR / {counts.files} FILES</span>
          <button onClick={() => setHelpOpen(true)}>CONTROLS [H]</button>
        </div>
      </header>

      <section className="command-panel" aria-label="Navegação e busca">
        <div className="eyebrow"><span>PATH</span> / CYBERSPACE</div>
        <nav className="breadcrumbs" aria-label="Caminho atual">
          {breadcrumb.map((node, index) => (
            <button
              key={node.id}
              onClick={() => { setCurrentId(node.id); setSelectedId(node.id); }}
              aria-current={index === breadcrumb.length - 1 ? "page" : undefined}
            >
              {node.name}
            </button>
          ))}
        </nav>
        <p className="directory-stats">
          {formatBytes(current.size)} <span>•</span> {counts.directories} pedestais <span>•</span> {counts.files} torres
        </p>
        <button className="open-folder" onClick={openDirectory} disabled={isScanning}>
          <span className="button-corner" />
          {isScanning ? "SCANNING DIRECTORY…" : "OPEN LOCAL DIRECTORY"}
          <kbd>⌘ O</kbd>
        </button>
        <input
          ref={inputRef}
          className="hidden-input"
          type="file"
          multiple
          onChange={onFilesSelected}
          {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        />
        <p className="privacy-note">Acesso local e somente leitura. Nenhum arquivo sai deste computador.</p>

        <div className="search-wrap">
          <label htmlFor="fsn-search">QUICK LOCATE</label>
          <input
            id="fsn-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type a filename…"
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((node) => (
                <button
                  key={node.id}
                  onClick={() => {
                    const parent = node.kind === "directory" ? node : findParent(root, node.id);
                    if (parent) setCurrentId(parent.id);
                    setSelectedId(node.id);
                    setSearch("");
                    requestAnimationFrame(() => sceneApi.current?.focus(node.id));
                  }}
                >
                  <span>{node.kind === "directory" ? "DIR" : "FIL"}</span>
                  {node.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="inspector" aria-live="polite">
        <div className="inspector-line">
          <span>OBJECT INFO</span>
          <i />
        </div>
        <p className="object-kind">{selected.kind === "directory" ? "DIRECTORY PEDESTAL" : "FILE TOWER"}</p>
        <h2>{selected.name}</h2>
        <dl>
          <div><dt>SIZE</dt><dd>{formatBytes(selected.size)}</dd></div>
          <div><dt>MODIFIED</dt><dd>{relativeAge(selected.modified)}</dd></div>
          <div><dt>TYPE</dt><dd>{selected.kind === "directory" ? "directory" : selected.mime || "file"}</dd></div>
          {selected.kind === "directory" && <div><dt>CHILDREN</dt><dd>{selected.children?.length ?? 0}</dd></div>}
        </dl>
        {selected.kind === "directory" && selected.id !== currentId && (
          <button className="enter-button" onClick={() => enterNode(selected)}>ENTER DIRECTORY ↗</button>
        )}
        <div className="age-key">
          <span>RECENT</span>
          <i />
          <span>OLDER</span>
        </div>
      </aside>

      {hovered && (
        <div className="hover-label">
          <strong>{hovered.name}</strong>
          <span>{formatBytes(hovered.size)} • double-click to enter</span>
        </div>
      )}

      <footer className="bottombar">
        <div className="sort-control">
          <span>LAYOUT BY</span>
          {(["size", "name", "age"] as SortMode[]).map((mode) => (
            <button key={mode} className={sortMode === mode ? "active" : ""} onClick={() => setSortMode(mode)}>
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="movement-hint">
          <span><kbd>DRAG</kbd> ORBIT</span>
          <span><kbd>SCROLL</kbd> ZOOM</span>
          <span><kbd>2× CLICK</kbd> ENTER</span>
          <span><kbd>ESC</kbd> UP</span>
        </div>
      </footer>

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Fechar ajuda">×</button>
            <span className="eyebrow">NAVIGATION PROTOCOL</span>
            <h2 id="help-title">Fly through your files.</h2>
            <div className="help-grid">
              <div><kbd>DRAG</kbd><p>Orbitar ao redor do diretório atual.</p></div>
              <div><kbd>SCROLL</kbd><p>Aproximar ou afastar a câmera.</p></div>
              <div><kbd>CLICK</kbd><p>Selecionar e inspecionar um objeto.</p></div>
              <div><kbd>2× CLICK</kbd><p>Entrar em um pedestal de diretório.</p></div>
              <div><kbd>ESC</kbd><p>Subir um nível na hierarquia.</p></div>
              <div><kbd>H</kbd><p>Abrir ou fechar esta tela.</p></div>
            </div>
            <p className="history-note">Inspirado no FSN da Silicon Graphics (1992), uma investigação pioneira sobre paisagens de informação.</p>
          </section>
        </div>
      )}
    </main>
  );
}
