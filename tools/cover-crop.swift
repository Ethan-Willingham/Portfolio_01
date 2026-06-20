// cover-crop.swift — replicate CSS object-fit:cover + object-position, write JPEG.
// Reads jobs from stdin, one per line: input output targetW targetH fx fy quality
// fx/fy are object-position fractions (0..1); 0.5/0.5 = center.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func load(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    return img
}

func coverCrop(_ img: CGImage, _ tw: Int, _ th: Int, _ fx: CGFloat, _ fy: CGFloat) -> CGImage? {
    let sw = CGFloat(img.width), sh = CGFloat(img.height)
    let TW = CGFloat(tw), TH = CGFloat(th)
    let scale = max(TW / sw, TH / sh)          // cover
    let drawW = sw * scale, drawH = sh * scale
    let x = -(drawW - TW) * fx                 // CSS object-position X
    let y = -(drawH - TH) * (1 - fy)           // flip for CG bottom-left origin
    guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(data: nil, width: tw, height: th, bitsPerComponent: 8,
                              bytesPerRow: 0, space: cs,
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: x, y: y, width: drawW, height: drawH))
    return ctx.makeImage()
}

func writeJPEG(_ img: CGImage, _ path: String, _ q: CGFloat) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                     UTType.jpeg.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
    CGImageDestinationFinalize(dest)
}

while let line = readLine() {
    let parts = line.split(separator: " ").map(String.init)
    guard parts.count == 7 else { continue }
    let inp = parts[0], out = parts[1]
    guard let tw = Int(parts[2]), let th = Int(parts[3]),
          let fx = Double(parts[4]), let fy = Double(parts[5]), let q = Double(parts[6]) else { continue }
    guard let img = load(inp) else { FileHandle.standardError.write("FAIL load \(inp)\n".data(using: .utf8)!); continue }
    guard let cropped = coverCrop(img, tw, th, CGFloat(fx), CGFloat(fy)) else { continue }
    writeJPEG(cropped, out, CGFloat(q))
    print("ok \(out)  \(tw)x\(th)  fx=\(fx) fy=\(fy)")
}
