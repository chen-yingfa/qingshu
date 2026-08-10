"""Generate Qingshu's dependency-free PNG and ICO package icons."""

from pathlib import Path
import struct
import zlib

SIZE = 512
BACKGROUND = (47, 85, 72, 255)
PAPER_LEFT = (255, 253, 247, 255)
PAPER_RIGHT = (248, 241, 231, 255)
SPINE = (201, 155, 107, 255)
LEAF = (143, 196, 159, 255)


def inside_polygon(x: float, y: float, points: list[tuple[int, int]]) -> bool:
    inside = False
    previous = points[-1]
    for current in points:
        if (current[1] > y) != (previous[1] > y):
            edge_x = (
                (previous[0] - current[0])
                * (y - current[1])
                / (previous[1] - current[1])
                + current[0]
            )
            if x < edge_x:
                inside = not inside
        previous = current
    return inside


def distance_to_segment(
    x: float, y: float, start: tuple[int, int], end: tuple[int, int]
) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length_squared = dx * dx + dy * dy
    ratio = max(
        0.0,
        min(1.0, ((x - start[0]) * dx + (y - start[1]) * dy) / length_squared),
    )
    return ((x - start[0] - ratio * dx) ** 2 + (y - start[1] - ratio * dy) ** 2) ** 0.5


def pixel(x: int, y: int) -> tuple[int, int, int, int]:
    color = BACKGROUND
    left_book = [(88, 130), (160, 114), (219, 137), (256, 167), (256, 411), (196, 377), (88, 374)]
    right_book = [(424, 130), (352, 114), (293, 137), (256, 167), (256, 411), (316, 377), (424, 374)]
    leaf = [(232, 207), (236, 153), (274, 111), (336, 92), (358, 100), (350, 142), (310, 188)]
    if inside_polygon(x, y, left_book):
        color = PAPER_LEFT
    if inside_polygon(x, y, right_book):
        color = PAPER_RIGHT
    if distance_to_segment(x, y, (256, 169), (256, 409)) <= 6:
        color = SPINE
    if inside_polygon(x, y, leaf):
        color = LEAF
    if distance_to_segment(x, y, (240, 199), (336, 124)) <= 5:
        color = BACKGROUND
    return color


def png_bytes() -> bytes:
    rows = []
    for y in range(SIZE):
        rows.append(b"\0" + b"".join(bytes(pixel(x, y)) for x in range(SIZE)))
    raw = b"".join(rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    directory = Path(__file__).parent
    png = png_bytes()
    (directory / "icon.png").write_bytes(png)
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22)
    (directory / "icon.ico").write_bytes(header + entry + png)


if __name__ == "__main__":
    main()
