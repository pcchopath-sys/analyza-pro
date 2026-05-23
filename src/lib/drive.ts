export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  // Ambil semua folder aktif di dalam parent untuk pembandingan case-insensitive secara menyeluruh
  const query = `mimeType = 'application/vnd.google-apps.folder' and trashed = false${
    parentId ? ` and '${parentId}' in parents` : ''
  }`;
  
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100`;
  
  const response = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mencari folder "${folderName}": ${errorText}`);
  }
  
  const searchResult = await response.json();
  const files = searchResult.files || [];
  
  // Pembandingan case-insensitive di sisi klien demi menghindari duplikasi folder
  const existingFolder = files.find(
    (file: any) => file.name.toLowerCase().trim() === folderName.toLowerCase().trim()
  );
  
  if (existingFolder) {
    return existingFolder.id;
  }
  
  // Folder tidak ditemukan, mari kita buat
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const body: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }
  
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Gagal membuat folder "${folderName}": ${errorText}`);
  }
  
  const createdFolder = await createResponse.json();
  return createdFolder.id;
}

export async function uploadFileToFolder(
  accessToken: string,
  file: File,
  folderId: string
): Promise<string> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const metadata = {
    name: file.name,
    parents: [folderId],
  };
  
  const metadataPart = 
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + '\r\n';
    
  const mediaPartHeader = 
    `Content-Type: ${file.type || 'application/pdf'}\r\n\r\n`;
  
  // Kita buat composite blob agar browser mengirim data biner langsung tanpa base64 encoding yang berat
  const compositeBlob = new Blob([
    delimiter,
    metadataPart,
    delimiter,
    mediaPartHeader,
    file,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: compositeBlob,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mengunggah file ke Google Drive: ${errorText}`);
  }
  
  const result = await response.json();
  return result.id;
}
