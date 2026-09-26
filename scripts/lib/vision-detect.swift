// Face, person and subject boxes for artist photos, via Apple's Vision framework.
//
// Reads image paths from stdin (one per line) and writes one JSON object per
// line to stdout: {"path", "faces", "people", "salient"}. Boxes are
// [x, y, w, h] as fractions of the image, origin top-left. macOS only; used
// by scripts/generate-artist-images.js.

import Foundation
import ImageIO
import Vision

func loadImage(_ path: String) -> CGImage? {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

/// Vision boxes are normalised with the origin bottom-left; flip to top-left.
func box(_ r: CGRect) -> [Double] {
  [r.minX, 1 - r.maxY, r.width, r.height].map { (Double($0) * 1000).rounded() / 1000 }
}

func emit(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}

while let line = readLine() {
  let path = line.trimmingCharacters(in: .whitespaces)
  if path.isEmpty { continue }
  guard let image = loadImage(path) else {
    emit(["path": path, "error": "unreadable"])
    continue
  }

  let faces = VNDetectFaceRectanglesRequest()
  let people = VNDetectHumanRectanglesRequest()
  people.upperBodyOnly = false
  let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  do {
    try handler.perform([faces, people, saliency])
  } catch {
    emit(["path": path, "error": "\(error)"])
    continue
  }

  let faceBoxes = (faces.results ?? []).filter { $0.confidence >= 0.5 }.map { box($0.boundingBox) }
  let peopleBoxes = (people.results ?? []).filter { $0.confidence >= 0.3 }.map { box($0.boundingBox) }
  let salientBoxes = (saliency.results?.first?.salientObjects ?? []).map { box($0.boundingBox) }

  emit(["path": path, "faces": faceBoxes, "people": peopleBoxes, "salient": salientBoxes])
}
