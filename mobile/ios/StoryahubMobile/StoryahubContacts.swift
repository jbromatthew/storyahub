import Contacts
import React

@objc(StoryahubContacts)
class StoryahubContacts: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  private func normalizePhone(_ raw: String?) -> String {
    guard var digits = raw?.replacingOccurrences(of: "\\D", with: "", options: .regularExpression) else {
      return ""
    }
    if digits.hasPrefix("82"), digits.count >= 10 {
      digits = "0" + String(digits.dropFirst(2))
    }
    if digits.hasPrefix("10"), digits.count == 10 {
      digits = "0" + digits
    }
    return digits
  }

  private func requestAccess(_ store: CNContactStore, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock, work: @escaping () -> Void) {
    store.requestAccess(for: .contacts) { granted, error in
      DispatchQueue.main.async {
        if let error {
          reject("contacts_denied", error.localizedDescription, error)
          return
        }
        if !granted {
          reject("contacts_denied", "연락처 접근 권한이 필요합니다", nil)
          return
        }
        work()
      }
    }
  }

  private func loadExistingPhones(_ store: CNContactStore) throws -> Set<String> {
    var phones = Set<String>()
    let keys: [CNKeyDescriptor] = [CNContactPhoneNumbersKey as CNKeyDescriptor]
    let request = CNContactFetchRequest(keysToFetch: keys)
    try store.enumerateContacts(with: request) { contact, _ in
      for labeled in contact.phoneNumbers {
        let norm = self.normalizePhone(labeled.value.stringValue)
        if norm.count >= 9 {
          phones.insert(norm)
        }
      }
    }
    return phones
  }

  @objc func fetchContacts(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let store = CNContactStore()
    requestAccess(store, resolve: resolve, reject: reject) {
      do {
        let keys: [CNKeyDescriptor] = [
          CNContactGivenNameKey as CNKeyDescriptor,
          CNContactFamilyNameKey as CNKeyDescriptor,
          CNContactOrganizationNameKey as CNKeyDescriptor,
          CNContactPhoneNumbersKey as CNKeyDescriptor,
          CNContactEmailAddressesKey as CNKeyDescriptor,
        ]
        let request = CNContactFetchRequest(keysToFetch: keys)
        var items: [[String: String?]] = []
        try store.enumerateContacts(with: request) { contact, _ in
          let given = contact.givenName.trimmingCharacters(in: .whitespacesAndNewlines)
          let family = contact.familyName.trimmingCharacters(in: .whitespacesAndNewlines)
          let person = [family, given].filter { !$0.isEmpty }.joined(separator: " ")
          let company = contact.organizationName.trimmingCharacters(in: .whitespacesAndNewlines)
          let phone = contact.phoneNumbers.first?.value.stringValue
          let email = contact.emailAddresses.first?.value as String?
          let norm = self.normalizePhone(phone)
          guard !person.isEmpty || !company.isEmpty else { return }
          guard norm.count >= 9 else { return }
          items.append([
            "person": person.isEmpty ? company : person,
            "phone": phone,
            "email": email,
            "company": company.isEmpty ? nil : company,
          ])
        }
        resolve(items)
      } catch {
        reject("contacts_read", error.localizedDescription, error)
      }
    }
  }

  @objc func exportContacts(
    _ contacts: [[String: Any]],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let store = CNContactStore()
    requestAccess(store, resolve: resolve, reject: reject) {
      do {
        var existing = try self.loadExistingPhones(store)
        var added = 0
        var skipped = 0
        for raw in contacts {
          let person = (raw["person"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let phoneRaw = (raw["phone"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let email = (raw["email"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let company = (raw["company"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let norm = self.normalizePhone(phoneRaw)
          guard norm.count >= 9 else {
            skipped += 1
            continue
          }
          if existing.contains(norm) {
            skipped += 1
            continue
          }

          let mutable = CNMutableContact()
          if person.contains(" ") {
            let parts = person.split(separator: " ", maxSplits: 1).map(String.init)
            mutable.familyName = parts.first ?? ""
            mutable.givenName = parts.count > 1 ? parts[1] : ""
          } else {
            mutable.givenName = person
          }
          if !company.isEmpty {
            mutable.organizationName = company
          }
          if !email.isEmpty {
            mutable.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: email as NSString)]
          }
          mutable.phoneNumbers = [
            CNLabeledValue(
              label: CNLabelPhoneNumberMobile,
              value: CNPhoneNumber(stringValue: phoneRaw)
            ),
          ]

          let save = CNSaveRequest()
          save.add(mutable, toContainerWithIdentifier: nil)
          try store.execute(save)
          existing.insert(norm)
          added += 1
        }
        resolve(["added": added, "skipped": skipped])
      } catch {
        reject("contacts_write", error.localizedDescription, error)
      }
    }
  }
}
