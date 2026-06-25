import Contacts
import React

@objc(StoryahubContacts)
class StoryahubContacts: NSObject {
  private let workQueue = DispatchQueue(label: "com.storyahub.contacts", qos: .userInitiated)

  private let contactKeys: [CNKeyDescriptor] = [
    CNContactIdentifierKey as CNKeyDescriptor,
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
    CNContactJobTitleKey as CNKeyDescriptor,
    CNContactDepartmentNameKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor,
    CNContactEmailAddressesKey as CNKeyDescriptor,
  ]

  @objc static func requiresMainQueueSetup() -> Bool {
    false
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

  private func finishResolve(_ resolve: @escaping RCTPromiseResolveBlock, _ value: Any) {
    DispatchQueue.main.async {
      resolve(value)
    }
  }

  private func finishReject(_ reject: @escaping RCTPromiseRejectBlock, _ code: String, _ message: String, _ error: Error? = nil) {
    DispatchQueue.main.async {
      reject(code, message, error)
    }
  }

  private func requestAccess(
    _ store: CNContactStore,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
    work: @escaping () -> Void
  ) {
    store.requestAccess(for: .contacts) { granted, error in
      if let error {
        self.finishReject(reject, "contacts_denied", error.localizedDescription, error)
        return
      }
      if !granted {
        self.finishReject(reject, "contacts_denied", "연락처 접근 권한이 필요합니다")
        return
      }
      self.workQueue.async {
        work()
      }
    }
  }

  private func contactDisplayName(person: String, title: String, company: String) -> String {
    var parts: [String] = []
    let p = person.trimmingCharacters(in: .whitespacesAndNewlines)
    let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let c = company.trimmingCharacters(in: .whitespacesAndNewlines)
    if !p.isEmpty { parts.append(p) }
    if !t.isEmpty { parts.append(t) }
    if !c.isEmpty { parts.append(c) }
    return parts.joined(separator: " · ")
  }

  private func applyDisplayName(_ mutable: CNMutableContact, person: String, title: String, company: String) {
    let display = contactDisplayName(person: person, title: title, company: company)
    guard !display.isEmpty else { return }
    mutable.familyName = ""
    mutable.givenName = display
  }

  private func personFromDisplayName(_ display: String, title: String, company: String) -> String {
    let trimmed = display.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.contains(" · ") else { return trimmed }
    return trimmed.components(separatedBy: " · ").first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? trimmed
  }

  private func applyStoryahubFields(
    _ mutable: CNMutableContact,
    person: String,
    title: String,
    department: String,
    company: String,
    email: String,
    phoneRaw: String,
    displayName: String,
    isNew: Bool
  ) {
    let label = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    if !label.isEmpty {
      mutable.familyName = ""
      mutable.givenName = label
    } else {
      applyDisplayName(mutable, person: person, title: title, company: company)
    }
    mutable.jobTitle = title
    mutable.departmentName = department
    mutable.organizationName = company

    if !email.isEmpty {
      mutable.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: email as NSString)]
    }

    if isNew || mutable.phoneNumbers.isEmpty {
      mutable.phoneNumbers = [
        CNLabeledValue(
          label: CNLabelPhoneNumberMobile,
          value: CNPhoneNumber(stringValue: phoneRaw)
        ),
      ]
    }
  }

  private func loadPhoneContactIds(_ store: CNContactStore) throws -> [String: String] {
    var map: [String: String] = [:]
    let keys: [CNKeyDescriptor] = [
      CNContactIdentifierKey as CNKeyDescriptor,
      CNContactPhoneNumbersKey as CNKeyDescriptor,
    ]
    let request = CNContactFetchRequest(keysToFetch: keys)
    try store.enumerateContacts(with: request) { contact, _ in
      for labeled in contact.phoneNumbers {
        let norm = self.normalizePhone(labeled.value.stringValue)
        if norm.count >= 9 {
          map[norm] = contact.identifier
        }
      }
    }
    return map
  }

  @objc func fetchContacts(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let store = CNContactStore()
    requestAccess(store, resolve: resolve, reject: reject) {
      do {
        let request = CNContactFetchRequest(keysToFetch: self.contactKeys)
        var items: [[String: String?]] = []
        try store.enumerateContacts(with: request) { contact, _ in
          let given = contact.givenName.trimmingCharacters(in: .whitespacesAndNewlines)
          let family = contact.familyName.trimmingCharacters(in: .whitespacesAndNewlines)
          let display = [family, given].filter { !$0.isEmpty }.joined(separator: " ")
          let company = contact.organizationName.trimmingCharacters(in: .whitespacesAndNewlines)
          let title = contact.jobTitle.trimmingCharacters(in: .whitespacesAndNewlines)
          let department = contact.departmentName.trimmingCharacters(in: .whitespacesAndNewlines)
          let person = self.personFromDisplayName(display, title: title, company: company)
          let phone = contact.phoneNumbers.first?.value.stringValue
          let email = contact.emailAddresses.first?.value as String?
          let norm = self.normalizePhone(phone)
          guard !person.isEmpty || !company.isEmpty else { return }
          guard norm.count >= 9 else { return }
          items.append([
            "person": person.isEmpty ? company : person,
            "title": title.isEmpty ? nil : title,
            "department": department.isEmpty ? nil : department,
            "phone": phone,
            "email": email,
            "company": company.isEmpty ? nil : company,
          ])
        }
        self.finishResolve(resolve, items)
      } catch {
        self.finishReject(reject, "contacts_read", error.localizedDescription, error)
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
        var phoneIds = try self.loadPhoneContactIds(store)
        var added = 0
        var updated = 0
        var skipped = 0

        for raw in contacts {
          let person = (raw["person"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let displayName = (raw["displayName"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let title = (raw["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let department = (raw["department"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let phoneRaw = (raw["phone"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let email = (raw["email"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let company = (raw["company"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          let norm = self.normalizePhone(phoneRaw)

          guard norm.count >= 9 else {
            skipped += 1
            continue
          }
          guard !person.isEmpty || !company.isEmpty else {
            skipped += 1
            continue
          }

          if let contactId = phoneIds[norm],
             let existing = try store.unifiedContact(withIdentifier: contactId, keysToFetch: self.contactKeys)
               .mutableCopy() as? CNMutableContact {
            self.applyStoryahubFields(
              existing,
              person: person,
              title: title,
              department: department,
              company: company,
              email: email,
              phoneRaw: phoneRaw,
              displayName: displayName,
              isNew: false
            )
            let save = CNSaveRequest()
            save.update(existing)
            try store.execute(save)
            updated += 1
          } else {
            let mutable = CNMutableContact()
            self.applyStoryahubFields(
              mutable,
              person: person,
              title: title,
              department: department,
              company: company,
              email: email,
              phoneRaw: phoneRaw,
              displayName: displayName,
              isNew: true
            )
            let save = CNSaveRequest()
            save.add(mutable, toContainerWithIdentifier: nil)
            try store.execute(save)
            phoneIds[norm] = mutable.identifier
            added += 1
          }
        }

        self.finishResolve(resolve, ["added": added, "updated": updated, "skipped": skipped])
      } catch {
        self.finishReject(reject, "contacts_write", error.localizedDescription, error)
      }
    }
  }
}
