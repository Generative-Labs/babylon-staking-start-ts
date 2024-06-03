import * as fs from 'fs';
import * as readline from 'readline';

export const readFileLineByLine = (filePath: string): Promise<string[]> => {
    const lines: string[] = [];
    const fileStream = fs.createReadStream(filePath);

    const readlineInterface = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    return new Promise((resolve, reject) => {
        readlineInterface.on('line', (line) => {
            lines.push(line);
        });

        readlineInterface.on('error', (err) => {
            reject(err);
        });

        readlineInterface.on('close', () => {
            resolve(lines);
        });
    });
};