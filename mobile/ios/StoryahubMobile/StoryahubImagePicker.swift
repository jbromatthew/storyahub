import AVFoundation
import Photos
import React
import UIKit

@objc(StoryahubImagePicker)
class StoryahubImagePicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var picker: UIImagePickerController?

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func pickFromCamera(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentPicker(sourceType: .camera, resolve: resolve, reject: reject)
    }
  }

  @objc func pickFromLibrary(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentPicker(sourceType: .photoLibrary, resolve: resolve, reject: reject)
    }
  }

  private func presentPicker(
    sourceType: UIImagePickerController.SourceType,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if self.resolve != nil {
      reject("busy", "이미 사진 선택 중입니다", nil)
      return
    }

    guard UIImagePickerController.isSourceTypeAvailable(sourceType) else {
      reject("unavailable", "카메라를 사용할 수 없습니다", nil)
      return
    }

    let openPicker = {
      guard let presenter = Self.topViewController() else {
        reject("presenter", "화면을 찾을 수 없습니다", nil)
        return
      }

      self.resolve = resolve
      self.reject = reject

      let picker = UIImagePickerController()
      picker.sourceType = sourceType
      picker.delegate = self
      picker.allowsEditing = false
      if sourceType == .camera {
        picker.cameraDevice = .rear
        picker.cameraCaptureMode = .photo
      }
      self.picker = picker
      presenter.present(picker, animated: true)
    }

    if sourceType == .camera {
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized:
        openPicker()
      case .notDetermined:
        AVCaptureDevice.requestAccess(for: .video) { granted in
          DispatchQueue.main.async {
            if granted {
              openPicker()
            } else {
              reject("permission", "카메라 권한이 거부되었습니다", nil)
            }
          }
        }
      default:
        reject("permission", "카메라 권한이 거부되었습니다", nil)
      }
      return
    }

    if #available(iOS 14, *) {
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      switch status {
      case .authorized, .limited:
        openPicker()
      case .notDetermined:
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
          DispatchQueue.main.async {
            if newStatus == .authorized || newStatus == .limited {
              openPicker()
            } else {
              reject("permission", "사진 접근 권한이 거부되었습니다", nil)
            }
          }
        }
      default:
        reject("permission", "사진 접근 권한이 거부되었습니다", nil)
      }
    } else {
      openPicker()
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
    var root = window?.rootViewController
    while let presented = root?.presentedViewController {
      root = presented
    }
    return root
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()
      self.reject?("cancelled", "cancelled", nil)
      self.cleanup()
    }
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()

      guard let image = info[.originalImage] as? UIImage else {
        self.reject?("image", "사진을 불러올 수 없습니다", nil)
        self.cleanup()
        return
      }

      let data = Self.jpegData(from: image)
      let filename = "photo-\(Int(Date().timeIntervalSince1970)).jpg"
      let path = (NSTemporaryDirectory() as NSString).appendingPathComponent(filename)

      do {
        try data.write(to: URL(fileURLWithPath: path))
        self.resolve?([
          "path": path,
          "mime": "image/jpeg",
          "filename": filename,
        ])
      } catch {
        self.reject?("save", error.localizedDescription, error)
      }

      self.cleanup()
    }
  }

  private func cleanup() {
    resolve = nil
    reject = nil
    picker = nil
  }

  private static func jpegData(
    from image: UIImage,
    maxSide: CGFloat = 2048,
    quality: CGFloat = 0.85
  ) -> Data {
    let size = image.size
    var target = size
    if max(size.width, size.height) > maxSide {
      let scale = maxSide / max(size.width, size.height)
      target = CGSize(width: size.width * scale, height: size.height * scale)
    }
    UIGraphicsBeginImageContextWithOptions(target, true, 1.0)
    image.draw(in: CGRect(origin: .zero, size: target))
    let scaled = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return scaled?.jpegData(compressionQuality: quality) ?? Data()
  }
}
