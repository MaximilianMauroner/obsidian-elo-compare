import { useState, useEffect, useRef } from 'react';
import { TFile, FrontMatterCache, Vault } from 'obsidian';
import type { PluginInfo } from '../types';

/**
 * Extracts cover image path from frontmatter
 */
function getCoverImagePath(
	frontmatter: FrontMatterCache | null,
	file: TFile
): string | null {
	if (!frontmatter) return null;

	// Check common cover property names
	const coverProps = ['cover', 'cover-image', 'coverImage', 'image', 'thumbnail', 'thumb'];
	for (const prop of coverProps) {
		const coverValue = frontmatter[prop];
		if (!coverValue) continue;

		let coverPath: string;

		// Handle different value types
		if (typeof coverValue === 'string') {
			coverPath = coverValue;
		} else if (Array.isArray(coverValue) && coverValue.length > 0) {
			coverPath = String(coverValue[0]);
		} else {
			coverPath = String(coverValue);
		}

		coverPath = coverPath.trim();

		// Return web URLs as-is
		if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
			return coverPath;
		}

		// Extract path from markdown image syntax: ![alt](path)
		if (coverPath.startsWith('[') && coverPath.includes('](')) {
			const match = coverPath.match(/\]\(([^)]+)\)/);
			if (match) {
				return resolveImagePath(match[1], file);
			}
		}

		// Return direct path
		return resolveImagePath(coverPath, file);
	}

	return null;
}

/**
 * Resolves image path relative to file or vault root
 */
function resolveImagePath(imagePath: string, file: TFile): string {
	// Remove leading # if present (fragment identifier)
	imagePath = imagePath.replace(/^#/, '');

	// Handle Obsidian wiki-link format [[image.png]]
	if (imagePath.startsWith('[[') && imagePath.endsWith(']]')) {
		imagePath = imagePath.slice(2, -2);
	}

	// Remove query parameters or anchors
	const cleanPath = imagePath.split('?')[0].split('#')[0];

	// If path starts with /, it's relative to vault root
	if (cleanPath.startsWith('/')) {
		return cleanPath.slice(1);
	}

	// Otherwise, resolve relative to the file's directory
	const fileDir = file.parent?.path || '';
	const resolvedPath = fileDir ? `${fileDir}/${cleanPath}` : cleanPath;

	// Normalize path (handle .. and .)
	const parts = resolvedPath.split('/');
	const normalizedParts: string[] = [];
	for (const part of parts) {
		if (part === '..') {
			normalizedParts.pop();
		} else if (part !== '.' && part !== '') {
			normalizedParts.push(part);
		}
	}

	return normalizedParts.join('/');
}

/**
 * Finds an image file in the vault, trying multiple strategies
 */
async function findImageFile(vault: Vault, coverPath: string): Promise<TFile | null> {
	// Try direct path first
	let imageFile = vault.getAbstractFileByPath(coverPath) as TFile | null;
	if (imageFile && imageFile instanceof TFile) {
		return imageFile;
	}

	// Try adding extension if missing
	const hasExtension = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(coverPath);
	if (!hasExtension) {
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
		for (const ext of imageExtensions) {
			const pathWithExt = `${coverPath}.${ext}`;
			const candidate = vault.getAbstractFileByPath(pathWithExt);
			if (candidate && candidate instanceof TFile) {
				return candidate;
			}
		}
	}

	// Search by filename
	const filename = coverPath.split('/').pop() || coverPath;
	const allFiles = vault.getFiles();

	// Try exact match
	for (const file of allFiles) {
		if (file instanceof TFile && file.name === filename) {
			return file;
		}
	}

	// Try case-insensitive match
	const filenameLower = filename.toLowerCase();
	for (const file of allFiles) {
		if (file instanceof TFile && file.name.toLowerCase() === filenameLower) {
			return file;
		}
	}

	return null;
}

/**
 * Gets MIME type from file extension
 */
function getMimeType(extension: string): string {
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		bmp: 'image/bmp',
	};
	return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
}

/**
 * Custom hook for loading cover images from frontmatter
 */
export function useCoverImage(
	frontmatter: FrontMatterCache | null,
	file: TFile | undefined,
	pluginInfo: PluginInfo
): string | null {
	const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
	const blobUrlRef = useRef<string | null>(null);
	const { vault } = pluginInfo;

	useEffect(() => {
		let cancelled = false;

		if (!frontmatter || !file) {
			setCoverImageUrl(null);
			return;
		}

		const coverPath = getCoverImagePath(frontmatter, file);
		if (!coverPath) {
			setCoverImageUrl(null);
			return;
		}

		// Use web URLs directly
		if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
			setCoverImageUrl(coverPath);
			return;
		}

		// Clean up previous blob URL
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}

		// Load image from vault
		(async () => {
			try {
				const imageFile = await findImageFile(vault, coverPath);
				if (cancelled || !imageFile) {
					if (!imageFile) {
						console.warn('[EloCompare] Image file not found at path:', coverPath);
					}
					return;
				}

				const extension = imageFile.extension.toLowerCase();
				const mimeType = getMimeType(extension);
				const arrayBuffer = await vault.readBinary(imageFile);

				if (cancelled) return;

				const blob = new Blob([arrayBuffer], { type: mimeType });
				const blobUrl = URL.createObjectURL(blob);
				blobUrlRef.current = blobUrl;

				if (!cancelled) {
					setCoverImageUrl(blobUrl);
				} else {
					URL.revokeObjectURL(blobUrl);
				}
			} catch (e) {
				console.error('[EloCompare] Failed to load cover image:', coverPath, e);
				if (!cancelled) {
					setCoverImageUrl(null);
				}
			}
		})();

		return () => {
			cancelled = true;
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [frontmatter, file?.path, vault]);

	return coverImageUrl;
}

