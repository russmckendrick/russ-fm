// Face, person and subject boxes for artist photos, via Apple's Vision framework.
//
// Reads image paths from stdin (one per line) and writes one JSON object per
// line to stdout: {"path", "faces", "people", "salient", "matte"}. Boxes are
// [x, y, w, h] as fractions of the image, origin top-left. A line may carry a
// second, tab-separated path: the subject's matte, at the photo's size, is
// written there as a greyscale PNG and "matte" is true. The matte is Vision's
// person segmentation (every person, not just the most salient ones); a photo
// with nobody in it falls back to the foreground mask (every instance, macOS
// 14+). False when neither finds anything. macOS only; used by
// scripts/generate-artist-images.js.

import CoreImage
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

let context = CIContext()

/// A one-channel 8-bit mask scaled to the photo's size and written as a greyscale PNG.
func write(_ buffer: CVPixelBuffer, size: CGSize, to path: String) -> Bool {
  let mask = CIImage(cvPixelBuffer: buffer)
  let scaled = mask.transformed(by: CGAffineTransform(scaleX: size.width / mask.extent.width, y: size.height / mask.extent.height))
  return (try? context.writePNGRepresentation(of: scaled, to: URL(fileURLWithPath: path), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())) != nil
}

/// Share of a one-channel 8-bit mask that is more than half on.
func coverage(_ buffer: CVPixelBuffer) -> Double {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
  let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
  let stride = CVPixelBufferGetBytesPerRow(buffer)
  let bytes = base.assumingMemoryBound(to: UInt8.self)
  var on = 0
  for y in 0..<height {
    for x in 0..<width where bytes[y * stride + x] > 128 { on += 1 }
  }
  return Double(on) / Double(max(1, width * height))
}

/// The subject's matte: the people, else (macOS 14+) the foreground. False when there's nothing to write.
func writeMatte(_ handler: VNImageRequestHandler, size: CGSize, to path: String) -> Bool {
  let people = VNGeneratePersonSegmentationRequest()
  people.qualityLevel = .accurate
  people.outputPixelFormat = kCVPixelFormatType_OneComponent8
  if (try? handler.perform([people])) != nil, let buffer = people.results?.first?.pixelBuffer, coverage(buffer) > 0.005 {
    return write(buffer, size: size, to: path)
  }
  guard #available(macOS 14.0, *) else { return false }
  let foreground = VNGenerateForegroundInstanceMaskRequest()
  guard (try? handler.perform([foreground])) != nil,
        let observation = foreground.results?.first,
        !observation.allInstances.isEmpty,
        let buffer = try? observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
  else { return false }
  let mask = CIImage(cvPixelBuffer: buffer)
  return (try? context.writePNGRepresentation(of: mask, to: URL(fileURLWithPath: path), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())) != nil
}

while let line = readLine() {
  let parts = line.split(separator: "\t", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
  guard let path = parts.first, !path.isEmpty else { continue }
  let mattePath = parts.count > 1 ? parts[1] : nil
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
  let matte = mattePath.map { writeMatte(handler, size: CGSize(width: image.width, height: image.height), to: $0) } ?? false

  emit(["path": path, "faces": faceBoxes, "people": peopleBoxes, "salient": salientBoxes, "matte": matte])
}
