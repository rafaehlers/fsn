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

const DAY = 86_400_000;
const MAX_LOCAL_FILES = 500;

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

function makeFileLabel(name: string, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(1, 10, 14, 0.82)";
  context.fillRect(8, 8, 496, 128);
  context.strokeStyle = "rgba(113, 255, 242, 0.65)";
  context.lineWidth = 2;
  context.strokeRect(8, 8, 496, 128);

  const displayName = name.length > 22 ? `${name.slice(0, 20)}…` : name;
  let fontSize = 27;
  context.font = `650 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  while (context.measureText(displayName).width > 450 && fontSize > 17) {
    fontSize -= 1;
    context.font = `650 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  }

  context.textAlign = "center";
  context.fillStyle = "#dcfffb";
  context.shadowColor = "#71fff2";
  context.shadowBlur = 9;
  context.fillText(displayName, 256, 61);
  context.shadowBlur = 5;
  context.fillStyle = "#ff75a6";
  context.font = "600 21px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(formatBytes(size), 256, 104);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.7, 1.04, 1);
  sprite.renderOrder = 50;
  return sprite;
}

function makeFlatFileIcon(mime?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d")!;
  const type = mime?.startsWith("image/")
    ? { code: "IMG", color: "#8fffd2" }
    : mime?.startsWith("text/") || mime?.includes("json")
      ? { code: "TXT", color: "#bdefff" }
      : mime?.startsWith("audio/")
        ? { code: "AUD", color: "#c7b3ff" }
        : mime?.includes("zip") || mime?.includes("archive")
          ? { code: "ZIP", color: "#ffd28f" }
          : { code: "FILE", color: "#91dcff" };

  context.shadowColor = type.color;
  context.shadowBlur = 18;
  context.fillStyle = type.color;
  context.fillRect(28, 14, 136, 164);
  context.shadowBlur = 0;

  context.fillStyle = "rgba(1, 12, 18, 0.2)";
  context.beginPath();
  context.moveTo(124, 14);
  context.lineTo(164, 54);
  context.lineTo(124, 54);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(1, 12, 18, 0.58)";
  context.fillRect(49, 76, 94, 8);
  context.fillRect(49, 96, 76, 8);
  context.fillRect(49, 116, 86, 8);
  context.fillRect(45, 139, 102, 27);

  context.fillStyle = "#f2fffd";
  context.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.fillText(type.code, 96, 159);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}

function ageColor(modified: number) {
  const days = Math.max(0, (Date.now() - modified) / DAY);
  if (days < 3) return new THREE.Color("#8ffcff");
  if (days < 30) return new THREE.Color("#4bd7ff");
  if (days < 180) return new THREE.Color("#6e8fff");
  return new THREE.Color("#b65cff");
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

  for (const file of files) {
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

  const openDirectory = useCallback(() => {
    // The experimental File System Access API can terminate embedded webviews.
    // A directory input uses the browser's safer, read-only file selection path.
    inputRef.current?.click();
  }, []);

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList?.length) return;

    const totalFiles = fileList.length;
    const files: File[] = [];
    for (let index = 0; index < Math.min(totalFiles, MAX_LOCAL_FILES); index += 1) {
      const file = fileList.item(index);
      if (file) files.push(file);
    }

    setIsScanning(true);
    setStatus("INDEXING SAFELY…");

    requestAnimationFrame(() => {
      try {
        const tree = filesToTree(files);
        setRoot(tree);
        setCurrentId(tree.id);
        setSelectedId(tree.id);
        setStatus(totalFiles > MAX_LOCAL_FILES ? `LOCAL • ${MAX_LOCAL_FILES}/${totalFiles} FILES` : "LOCAL • READ ONLY");
      } catch {
        setStatus("INDEX ERROR • DEMO RESTORED");
      } finally {
        setIsScanning(false);
      }
    });

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
    const files = sortedChildren.filter((node) => node.kind === "file").slice(0, 32);

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

    const title = makeLabel(current.name.toUpperCase(), "#55ffad");
    title.position.set(0, 0.42, 7.3);
    group.add(title);
    disposables.push((title.material as THREE.SpriteMaterial).map!, title.material);

    const columns = Math.max(1, Math.ceil(Math.sqrt(files.length)));
    files.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const spacingX = Math.min(1.45, 11.5 / columns);
      const spacingZ = Math.min(1.45, 7.5 / Math.max(1, Math.ceil(files.length / columns)));
      const height = 0.42 + Math.max(0.25, (Math.log10(node.size + 10) / Math.log10(maxSize + 10)) * 3.7);
      const towerWidth = Math.max(0.35, spacingX * 0.62);
      const towerDepth = Math.max(0.35, spacingZ * 0.62);
      const tower = makeBox(
        towerWidth,
        height,
        towerDepth,
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

      const iconSize = Math.min(1.05, Math.max(0.66, Math.min(towerWidth, towerDepth) * 1.28));
      const fileIcon = makeFlatFileIcon(node.mime);
      fileIcon.scale.set(iconSize, iconSize, 1);
      fileIcon.position.set(
        tower.position.x,
        stageHeight + height + iconSize * 0.5 + 0.06,
        tower.position.z,
      );
      group.add(fileIcon);
      disposables.push((fileIcon.material as THREE.SpriteMaterial).map!, fileIcon.material);

      const fileLabel = makeFileLabel(node.name, node.size);
      fileLabel.position.set(
        tower.position.x,
        stageHeight + 0.42 + (column % 2) * 0.12,
        tower.position.z + towerDepth / 2 + 0.78,
      );
      fileLabel.scale.multiplyScalar(files.length > 20 ? 0.5 : 0.6);
      group.add(fileLabel);
      disposables.push((fileLabel.material as THREE.SpriteMaterial).map!, fileLabel.material);
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

      const radialLength = Math.hypot(x, z) || 1;
      const label = makeLabel(node.name, "#55ffad");
      label.position.set(
        x - (x / radialLength) * 4.15,
        0.42,
        z - (z / radialLength) * 4.15,
      );
      label.scale.set(5.8, 1.1, 1);
      group.add(label);
      disposables.push((label.material as THREE.SpriteMaterial).map!, label.material);

      const childFiles = (node.children ?? []).filter((child) => child.kind === "file").slice(0, 6);
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

        const childIcon = makeFlatFileIcon(child.mime);
        childIcon.scale.set(0.72, 0.72, 1);
        childIcon.position.set(
          block.position.x,
          pedestalHeight + childHeight + 0.42,
          block.position.z,
        );
        group.add(childIcon);
        disposables.push((childIcon.material as THREE.SpriteMaterial).map!, childIcon.material);

        const childLabel = makeFileLabel(child.name, child.size);
        childLabel.position.set(
          block.position.x,
          pedestalHeight + 0.34,
          block.position.z + 0.96,
        );
        childLabel.scale.multiplyScalar(0.46);
        group.add(childLabel);
        disposables.push((childLabel.material as THREE.SpriteMaterial).map!, childLabel.material);
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
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const material = mesh.material;
      if (!material.emissive) return;
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
        <p className="privacy-note">Modo seguro: somente metadados de até {MAX_LOCAL_FILES} arquivos. Nada sai deste computador.</p>

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
