/** Teacher-maintained list of rooms for the multi-game overview (localStorage). */

export interface TeacherRoomEntry {
  roomCode: string;
  gameId: string;
  label?: string;
  addedAt: string;
}

const TEACHER_ROOMS_KEY = "amono.teacherRooms";

export function loadTeacherRooms(): TeacherRoomEntry[] {
  try {
    const raw = localStorage.getItem(TEACHER_ROOMS_KEY);
    return raw ? (JSON.parse(raw) as TeacherRoomEntry[]) : [];
  } catch {
    return [];
  }
}

function saveTeacherRooms(rooms: TeacherRoomEntry[]): void {
  localStorage.setItem(TEACHER_ROOMS_KEY, JSON.stringify(rooms));
}

export function addTeacherRoom(entry: Omit<TeacherRoomEntry, "addedAt"> & { addedAt?: string }): void {
  const rooms = loadTeacherRooms().filter((r) => r.roomCode !== entry.roomCode);
  rooms.unshift({
    ...entry,
    addedAt: entry.addedAt ?? new Date().toISOString(),
  });
  saveTeacherRooms(rooms);
}

export function removeTeacherRoom(roomCode: string): void {
  saveTeacherRooms(loadTeacherRooms().filter((r) => r.roomCode !== roomCode));
}
