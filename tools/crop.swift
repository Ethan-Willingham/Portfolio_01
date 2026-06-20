import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// usage: swift crop.swift in out cropX cropY cropW cropH outW outH [quality]
let a = CommandLine.arguments
guard a.count >= 9 else { fputs("args\n", stderr); exit(1) }
let input = a[1], output = a[2]
let cx = Int(a[3])!, cy = Int(a[4])!, cw = Int(a[5])!, ch = Int(a[6])!
let ow = Int(a[7])!, oh = Int(a[8])!
let q = a.count >= 10 ? Double(a[9])! : 0.88

let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: input) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let cropped = img.cropping(to: CGRect(x: cx, y: cy, width: cw, height: ch))!
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: ow, height: oh))
let out = ctx.makeImage()!
let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL,
                                          UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dst, out, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
CGImageDestinationFinalize(dst)
print("wrote \(output) \(ow)x\(oh)")
