/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fileSystem from "fs";
import * as mkpath from "mkpath";
import * as path from "path";

/**
 * Describes possible image formats.
 */
export const enum ImageFormat {
    UNKNOWN = 0,
    SVG,
    PNG,
    BMP,
    JPG,
    TIFF,
    GIF
}

// Extensions array should be constents with ImageFormat enum.
const _imageExtensions: string[][] = [
    [""],
    [".svg"],
    [".png"],
    [".bmp"],
    [".jpg", ".jpeg"],
    [".tif", ".tiff"],
    [".gif"]
];
const _imageMimeTypes: string[] = [
    "",
    "",
    "image/png",
    "image/bmp",
    "image/jpeg",
    "image/tiff",
    "image/gif"
];

/**
 * Handy class for accessing file system resource.
 *
 * Class in mainly focus on parsing image files, recognizing their formats and
 * extensions.
 */
export class FileSystem {
    /**
     * Try to acquire file extention from the path specified.
     *
     * @param filePath - file path
     * @returns file extension in form of '.xxx' or empty string if not found.
     */
    static getFileExtension(filePath: string): string {
        return path.extname(filePath);
    }

    /**
     * Get array of known file extensions for ImageFormat specified.
     *
     * @param imageFormat - one of known ImageFormat specifiers.
     * @returns array of known image extensions or empty array if ImageFromat is
     * not recognized (unknown).
     */
    static getImageFormatExtensions(imageFormat: ImageFormat): string[] {
        let fileFormatExtensions: string[] = [];
        switch (imageFormat) {
            case ImageFormat.UNKNOWN:
                throw new Error("Unsupported image format specified!");
            default:
                fileFormatExtensions = _imageExtensions[imageFormat];
        }
        return fileFormatExtensions;
    }

    /**
     * Try to recognize file extension and return mathing image format if known.
     *
     * @param fileExtension - file extension starting from "." dot character.
     * @returns recognized ImageFormat enum or ImageFormat.UNKNOWN if not match was found.
     */
    static getImageFormatByExtension(fileExtension: string): ImageFormat {
        const idx = _imageExtensions.findIndex(extensions => {
            return extensions.includes(fileExtension.toLowerCase());
        });
        if (idx > 0) {
            return idx as ImageFormat;
        } else {
            return ImageFormat.UNKNOWN;
        }
    }

    /**
     * Find image file format knowing its path.
     *
     * Decodes image format based on file extentsion.
     *
     * @param filePath - image file path to be recognized.
     * @returns recognized image format or ImageFormat.UNKNOWN if not recognized.
     * @notes Later on this method may be extended by reading binary image
     * header and thus could recognize image format even without known
     * extension.
     */
    static getImageFormat(filePath: string): ImageFormat {
        const fileExtension: string = FileSystem.getFileExtension(filePath);
        const fileFormat: ImageFormat = FileSystem.getImageFormatByExtension(fileExtension);
        return fileFormat;
    }

    /**
     * Get file (image) MIME type string corresponding to image format.
     *
     * If file path specifies extension with unsuported mime type returns empty string.
     *
     * @param filePath - file path with one of supported image extensions.
     * @returns MIME type string or empty string if corresponding MIME type is not found or
     * not supported.
     */
    static getImageMimeType(filePath: string): string {
        const imageFormat: ImageFormat = FileSystem.getImageFormat(filePath);
        return _imageMimeTypes[imageFormat];
    }

    /**
     * Get absolute path to the file or directory given path relative to package root.
     *
     * @param relativePath - path relative to package root directory.
     * @returns absolute path to resource given.
     * @note This utility does not check resource existance but simply modifies path,
     * which is assumed to be correct.
     */
    static getPathAbsolute(relativePath: string): string {
        return path.resolve(process.cwd(), relativePath);
    }

    /**
     * Parse directory to find all files with extensions specified.
     *
     * @param directoryPath - absolute path to directory beeing searched.
     * @param fileExtensions - array of extensions to be searched for.
     * @retuns array of files paths that matches the queried extensions in directory
     * specified.
     */
    static getFilesListWithExtensions(directoryPath: string, fileExtensions: string[]): string[] {
        const files: string[] = fileSystem.readdirSync(directoryPath);
        const filesFiltered = files.filter(fileName => {
            // eslint-disable-next-line @typescript-eslint/no-for-in-array
            for (const fileExt in fileExtensions) {
                if (fileName.toLowerCase().endsWith(fileExt)) {
                    return true;
                }
            }
            return false;
        });
        return filesFiltered;
    }

    /**
     * Find list of files (images) in directory matching the format specified.
     *
     * @param directoryPath - absolute path to the directory.
     * @param imageFormat - image format to be searched for.
     * @note Method uses naive approach that is based on the file extension, it
     * will never recognize files without known image extension.
     */
    static getFilesListWithFormat(directoryPath: string, imageFormat: ImageFormat): string[] {
        const fileExtensions: string[] = FileSystem.getImageFormatExtensions(imageFormat);
        return FileSystem.getFilesListWithExtensions(directoryPath, fileExtensions);
    }

    /**
     * Synchronously reads data buffer from file.
     *
     * @param path - A path to a file. If a URL is provided, it must use the `file:`
     * protocol.
     * @returns file contents in Buffer object.
     */
    static readFileSync(filePath: string): Buffer {
        return fileSystem.readFileSync(filePath);
    }

    /**
     * Read entire content of the file asynchronously.
     *
     * @param filePath - A path to a file. If a URL is provided, it must use the `file:`
     * protocol.
     * @returns Promise with file contents in Buffer object.
     */
    static readFile(filePath: string): Promise<Buffer> {
        const promise = new Promise<Buffer>((resolve, reject) => {
            fileSystem.readFile(
                filePath,
                {},
                (error: NodeJS.ErrnoException | null, buffer: Buffer) => {
                    if (error) {
                        reject(new Error(error.message));
                    } else {
                        resolve(buffer);
                    }
                }
            );
        });
        return promise;
    }

    /**
     * Write entire buffer to file synchronously, replacing the file if it already exists.
     *
     * @param filePath - file storage path.
     * @param data - buffer to be stored.
     */
    static writeFileSync(filePath: string, data: Buffer | string) {
        fileSystem.writeFileSync(filePath, data);
    }

    /**
     * Write entire buffer to file asynchronously, replacing the file if it already exists.
     *
     * @param filePath - file storage path.
     * @param data - buffer to be stored.
     * @returns Promise.
     */
    static writeFile(filePath: string, data: Buffer | string): Promise<void> {
        return new Promise((resolve, reject) => {
            fileSystem.writeFile(filePath, data, (error: NodeJS.ErrnoException | null) => {
                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Remove file at given path synchronously.
     *
     * @param filePath - path to existing file.
     */
    static removeFileSync(filePath: string) {
        fileSystem.unlinkSync(filePath);
    }

    /**
     * Allows to list a content of directory or files matching expression.
     *
     * @param pathExpression - path to directory or filtering expression that supports
     * wildcards notation (i.e.: /dirPath/*.png)
     * @returns list of files as string array.
     */
    static listFilesSync(pathExpression: string): string[] {
        // TODO: Consider declaring as global.
        const glob = require("glob");
        return glob.sync(pathExpression);
    }

    /**
     * Create directory synchronously.
     *
     * @param dirPath - path to directory.
     */
    static createDirSync(dirPath: string) {
        mkpath.sync(dirPath);
    }

    /**
     * Remove directory synchronously.
     *
     * @param dirPath - path to existing directory.
     */
    static removeDirSync(dirPath: string, force: boolean = false) {
        if (force) {
            const files: string[] = this.listFilesSync(path.join(dirPath, "*"));
            files.forEach(file => {
                this.removeFileSync(file);
            });
        }
        fileSystem.rmdirSync(dirPath);
    }
}
