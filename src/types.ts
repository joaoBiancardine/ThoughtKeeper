export type Note = {
    id: string;
    title: string;
    body: string;
    createdAt: number;
    updatedAt: number;
};

export type StoredData = {
    version: 1;
    notes: Note[];
};