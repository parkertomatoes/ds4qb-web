type FatPathMapping = {
    [path: string]: string; // Maps original path component to FAT LFN
};

export class FatPathMapper {
    #mapping: FatPathMapping = {};
    #shortNameSet: Set<string> = new Set();

    /**
     * Converts a name to an 8.3-compliant short name.
     */
    #generateShortName(originalName: string): string {
        const name = originalName.replace(/[\\/:*?"<>|]/g, ''); // Sanitize name
        const dotIndex = name.lastIndexOf('.');
        const base = (dotIndex === -1 ? name : name.slice(0, dotIndex)).slice(0, 8);
        const ext = (dotIndex === -1 ? '' : name.slice(dotIndex + 1)).slice(0, 3);

        let shortName = `${base}.${ext}`.replace(/\.$/, ''); // Remove trailing dot if no extension
        let counter = 1;

        // Ensure the short name is unique
        while (this.#shortNameSet.has(shortName)) {
            const suffix = `~${counter}`;
            shortName = `${base.slice(0, 8 - suffix.length)}${suffix}.${ext}`.replace(/\.$/, '');
            counter++;
        }

        this.#shortNameSet.add(shortName);
        return shortName;
    }

    static #removeRelativeComponents(path: string[]) {
        return path.reduce((acc, component) => {
            if (component === "..") {
                acc.pop();
            } else if (component !== "." && component !== "") {
                acc.push(component);
            }
            return acc;
        }, [] as string[]);
    }

    public toFatPath(path: string): string {
        const sanitized = path.startsWith('/') || path.startsWith('\\')
            ? path.substring(1)
            : path;
        const components = sanitized.split(/[\\/]/).map(c => c.toUpperCase()); // Split path into components
        const reducedComponents = FatPathMapper.#removeRelativeComponents(components)
        const mappedComponents = reducedComponents.map(component => {
            if (!this.#mapping[component]) {
                const shortName = this.#generateShortName(component);
                this.#mapping[component] = shortName;
            }
            return this.#mapping[component];
        });
        return mappedComponents.join('\\'); // Reassemble the path with backslashes
    }
}
