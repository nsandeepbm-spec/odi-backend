import type { LegalCompany, LegalPage, LegalSection } from './legal.types.js';

function p(text: string) {
  return { type: 'p' as const, text };
}
function h3(text: string) {
  return { type: 'h3' as const, text };
}
function ul(items: string[]) {
  return { type: 'ul' as const, items };
}
const contact = { type: 'contact' as const };

function sec(id: string, title: string, blocks: LegalSection['blocks']): LegalSection {
  return { id, title, blocks };
}

export const SEED_COMPANY: LegalCompany = {
  brand: 'ODI Studio',
  entity: 'Oceaniek Technologies India',
  address:
    'ODI Studio, 2nd Floor, Plot No. D-254, 8A, Industrial Area, Sector 75, Sahibzada Ajit Singh Nagar, Punjab – 140307, India',
  gstin: '03AAIFO2899P1ZI',
  email: 'hello@odi.studio',
  phone: '+91 9876907266',
  websiteHref: 'https://www.odi.studio',
  websiteLabel: 'www.odi.studio',
};

const DATES = { effectiveDate: '3 September 2026', lastUpdated: '3 September 2026' };

const TERMS_SECTIONS: LegalSection[] = [
  sec('about', 'About ODI Studio', [
    p('ODI Studio is a brand operated by:'),
    contact,
    p(
      'Throughout these Terms, “ODI Studio”, “ODI”, “we”, “us” and “our” refer to Oceaniek Technologies India, operating under the brand name ODI Studio.'
    ),
    p(
      'By placing an order, purchasing a product, requesting a service, using our website, or otherwise engaging with ODI Studio, you acknowledge that you have read and understood these Terms. If you do not agree with these Terms, please do not place an order or use our services.'
    ),
  ]),
  sec('products-services', 'Products and services', [
    p('ODI Studio may provide or sell:'),
    h3('3D Adventure Kit'),
    p(
      'The ODI 3D Adventure Kit may contain physical and/or educational/creative materials, such as books, printed materials, 3D viewing glasses and other components described on the relevant product page, quotation, invoice or order confirmation. The exact contents of a particular kit are determined by the product description applicable at the time of purchase.'
    ),
    p(
      'Product images are for representation and may differ slightly from the physical product because of photography, screen settings, printing, manufacturing or packaging variations.'
    ),
    h3('Stereo conversion services'),
    p(
      'ODI Studio may provide stereo conversion, 2D-to-3D conversion, stereoscopic content production, visual effects, animation, post-production, compositing and related creative services. The precise scope of each service will be determined by the applicable quotation, proposal, work order, purchase order, invoice, email confirmation or other written agreement between ODI Studio and the customer.'
    ),
    p(
      'Where a separate written agreement exists, that agreement will prevail over these Terms to the extent of any inconsistency.'
    ),
  ]),
  sec('eligibility', 'Eligibility', [
    p('You must have legal capacity to enter into a binding contract under applicable law.'),
    p(
      'Where an order is placed on behalf of a company, institution, school, organisation or other entity, the person placing the order represents that they are authorised to place the order and bind that entity.'
    ),
    p(
      'Where products are purchased for or used by children or minors, the purchase and use should be supervised by a parent, guardian, teacher or responsible adult as appropriate.'
    ),
  ]),
  sec('product-information', 'Product information', [
    p(
      'We make reasonable efforts to ensure that product descriptions, images, specifications, prices and other information displayed on our website are accurate. However:'
    ),
    ul([
      'colours may vary between screens and physical products;',
      'printed materials may contain minor manufacturing or printing variations;',
      'packaging may change without materially changing the product;',
      'product specifications may be updated from time to time;',
      'availability may change without prior notice.',
    ]),
    p(
      'We will not intentionally publish materially misleading information about our products or services. If a material error in price, product description or availability is identified before fulfilment, we may contact the customer to correct the error or cancel the affected order and refund any amount already paid for that order.'
    ),
  ]),
  sec('orders', 'Orders and order acceptance', [
    p(
      'Submitting an order constitutes an offer to purchase. An order is not necessarily accepted merely because it has been submitted or payment has been made. We may accept an order by issuing an order confirmation, invoice, dispatch confirmation, commencing the agreed service, or otherwise confirming acceptance.'
    ),
    p('We reserve the right to decline or cancel an order where reasonably necessary, including in cases of:'),
    ul([
      'suspected fraud or unauthorised transactions;',
      'incorrect pricing caused by an obvious error;',
      'inability to supply the product;',
      'inaccurate or incomplete customer information;',
      'duplicate or technically erroneous orders;',
      'legal or regulatory restrictions.',
    ]),
    p(
      'If an order is cancelled by us after payment has been received, the amount received for the cancelled portion will ordinarily be refunded through the applicable payment method, subject to applicable law.'
    ),
  ]),
  sec('pricing', 'Pricing, taxes and invoices', [
    p(
      'All prices displayed by ODI Studio will indicate whether applicable taxes are included or charged separately, as required by applicable law. Applicable GST and other statutory charges will be charged in accordance with the law applicable to the relevant supply. Where GST is applicable, invoices will be issued in accordance with applicable GST requirements.'
    ),
    p(
      'Customers should retain invoices, order confirmations and payment records for their records. For business customers requiring GST-compliant invoices, the customer is responsible for providing accurate billing details, including GSTIN and registered address where applicable. Providing an incorrect GSTIN or billing information may affect the customer’s ability to claim input tax credit.'
    ),
  ]),
  sec('payment', 'Payment', [
    p(
      'Payments may be accepted through payment methods made available by ODI Studio, including online payment gateways, UPI, bank transfer, cash for eligible offline transactions, or other approved methods. For offline orders, an invoice or appropriate transaction document will be issued as applicable.'
    ),
    p(
      'An order will generally be processed after payment is successfully received unless otherwise agreed in writing. For custom services, projects or large orders, ODI Studio may require an advance payment or milestone-based payment schedule as stated in the quotation or agreement.'
    ),
  ]),
  sec('delivery', 'Delivery and shipping', [
    p(
      'Physical products will be shipped to the delivery address supplied by the customer. The customer is responsible for providing a complete and accurate delivery address and contact details. Delivery timelines are estimates unless a specific delivery commitment has been expressly agreed in writing.'
    ),
    p('Delays may occur because of:'),
    ul([
      'courier or logistics issues;',
      'weather or natural events;',
      'strikes or transport disruptions;',
      'government restrictions;',
      'incorrect customer information;',
      'force majeure events;',
      'circumstances outside ODI Studio’s reasonable control.',
    ]),
    p(
      'A delay does not automatically constitute a product defect. Where a product is lost, materially damaged or incorrectly delivered during transportation, the customer should contact ODI Studio promptly with the relevant order and delivery information.'
    ),
  ]),
  sec('damaged', 'Damaged, defective or incorrect products', [
    p(
      'ODI Studio aims to supply products in good condition. If a customer receives a product that is physically damaged, defective, materially incomplete or materially different from the product ordered, the customer should contact us as soon as reasonably possible and provide:'
    ),
    ul([
      'order/invoice number;',
      'photographs or video of the package and product;',
      'description of the issue;',
      'photographs of any visible shipping damage;',
      'other information reasonably required to investigate the claim.',
    ]),
    p('Where the claim is verified, ODI Studio may, as appropriate and subject to applicable law:'),
    ul([
      'replace the affected product or component;',
      'repair or rectify the issue where reasonably possible;',
      'provide a refund;',
      'provide another appropriate remedy required by law.',
    ]),
    p(
      'For transit damage, customers are strongly encouraged to photograph or record the unopened package and packaging immediately upon delivery and before disposing of any packaging material. A claim may be investigated before a replacement or refund is approved.'
    ),
  ]),
  sec('returns', 'Returns and refunds', [
    p(
      'ODI Studio does not provide an unrestricted “change of mind” return policy unless a particular product page or written offer expressly provides one. However, this policy does not remove or restrict any mandatory rights or remedies available to consumers under applicable law.'
    ),
    h3('Damaged or defective products'),
    p(
      'Where a product is verified to have arrived damaged or defective, ODI Studio will provide an appropriate remedy in accordance with the damaged-product section above and applicable law.'
    ),
    h3('Incorrect product'),
    p(
      'If ODI Studio sends a materially incorrect product, the customer should contact us promptly. Subject to verification, we will arrange an appropriate correction, replacement or refund as applicable.'
    ),
    h3('Customer-caused damage'),
    p('A return, replacement or refund may not be available where damage results from:'),
    ul([
      'misuse;',
      'negligence;',
      'modification or alteration;',
      'improper storage;',
      'accidental damage after delivery;',
      'use contrary to reasonable instructions;',
      'normal wear and tear.',
    ]),
    p('This does not affect any rights that cannot legally be excluded.'),
    h3('Used, modified or incomplete products'),
    p(
      'Where legally permissible, products that have been materially used, modified, damaged by the customer, or returned without required components may not qualify for a voluntary return. Mandatory statutory consumer rights remain unaffected.'
    ),
    h3('Refund processing'),
    p(
      'Where a refund is approved, ODI Studio will process the refund within the applicable period required by law or, where no statutory period applies, within a reasonable period. The actual time for the funds to appear in the customer’s account may depend on the payment provider, bank or payment method.'
    ),
  ]),
  sec('cancellation-services', 'Cancellation of service orders', [
    p(
      'For stereo conversion and other creative services, cancellation terms may depend on the project stage. Unless otherwise agreed in writing:'
    ),
    ul([
      'work that has not commenced may generally be cancelled subject to any applicable contractual terms;',
      'once substantial work has commenced, fees may become payable for work already performed;',
      'third-party expenses or committed production costs may be recoverable where agreed or legally permissible;',
      'completed or substantially completed creative work may not be refundable merely because the customer changes their requirements.',
    ]),
    p(
      'For customised projects, the applicable quotation or project agreement should specify the payment milestones, cancellation terms and deliverables. Nothing in this section excludes rights or remedies that cannot legally be excluded.'
    ),
  ]),
  sec('stereo-services', 'Stereo conversion services', [
    p('Stereo conversion is a creative and technical process. The final output may depend on:'),
    ul([
      'source footage quality;',
      'camera characteristics;',
      'resolution;',
      'compression;',
      'lighting;',
      'motion;',
      'depth information;',
      'artistic direction;',
      'intended viewing system;',
      'customer specifications.',
    ]),
    p(
      'Accordingly, ODI Studio does not guarantee that every source file can produce an identical result across every display, headset, projection system or viewing environment. Unless expressly agreed otherwise, creative judgement regarding depth treatment, visual interpretation, conversion methodology and technical implementation remains with ODI Studio.'
    ),
    p(
      'Where the customer provides source material, the customer is responsible for ensuring that they have the necessary rights and permissions to provide that material for processing.'
    ),
  ]),
  sec('customer-content', 'Customer-supplied content and intellectual property', [
    p(
      'The customer represents that they have all necessary rights, permissions, licences and authorisations required to provide any images, videos, audio, artwork, trademarks, logos, text, photographs, footage or other materials supplied to ODI Studio.'
    ),
    p(
      'The customer must not provide content that infringes another person’s copyright, trademark, privacy, publicity, contractual or other legal rights. The customer shall be responsible for claims arising from materials supplied by the customer where the claim results from the customer’s lack of rights or authorisation.'
    ),
    p(
      'ODI Studio may refuse to process material where it reasonably believes that processing the material may violate applicable law or third-party rights.'
    ),
  ]),
  sec('odi-ip', 'ODI Studio intellectual property', [
    p('Unless expressly stated otherwise in writing, ODI Studio retains ownership of its pre-existing:'),
    ul([
      'software, tools, workflows, templates and techniques;',
      'know-how, production methods and internal production assets;',
      'branding, logos, website content, educational materials and original designs.',
    ]),
    p(
      'Payment for a service does not automatically transfer ownership of ODI Studio’s pre-existing intellectual property. Ownership or licensing of project-specific deliverables will be governed by the applicable quotation, contract, purchase order or written agreement.'
    ),
  ]),
  sec('deliverables', 'Customer rights in final deliverables', [
    p(
      'Where a project includes a transfer or licence of rights in final deliverables, the scope of that transfer or licence will be determined by the applicable written agreement. Unless expressly agreed otherwise, ODI Studio does not automatically transfer ownership of:'
    ),
    ul([
      'source files, project files or editable working files;',
      'internal production assets or third-party licensed assets;',
      'software, plugins or templates;',
      'unused concepts or intermediate versions.',
    ]),
    p(
      'If the customer requires source files or exclusive rights, this should be agreed in writing before or during the project.'
    ),
  ]),
  sec('portfolio', 'Portfolio and marketing use', [
    p(
      'Unless the parties agree otherwise in writing, ODI Studio may display completed work created by ODI Studio in its portfolio, website, presentations, awards submissions or marketing materials, provided that doing so does not violate a customer’s confidentiality obligations or third-party rights.'
    ),
    p(
      'Customers who require confidentiality or prohibit portfolio use should communicate this requirement before project commencement. ODI Studio will honour a mutually agreed written confidentiality restriction.'
    ),
  ]),
  sec('website-use', 'Website use', [
    p('You agree to use the website lawfully and responsibly. You must not:'),
    ul([
      'attempt to gain unauthorised access to our systems;',
      'introduce malicious code;',
      'interfere with website operation;',
      'scrape or systematically copy website content without permission;',
      'impersonate ODI Studio or another person;',
      'submit fraudulent information;',
      'use the website for unlawful activities.',
    ]),
    p(
      'We may suspend access to portions of the website where reasonably necessary to protect our systems, customers or legal interests.'
    ),
  ]),
  sec('third-party', 'Third-party services', [
    p(
      'ODI Studio may use third-party services for payments, hosting, analytics, communication, shipping, cloud storage, customer support or other business operations. Third-party services may have their own terms and privacy policies.'
    ),
    p(
      'ODI Studio is not responsible for independent failures of third-party systems outside our reasonable control, although we will take reasonable steps to assist customers where appropriate.'
    ),
  ]),
  sec('safety', 'Product safety and instructions', [
    p(
      'Customers should use products according to the instructions supplied with the product. Where a product includes 3D glasses or other viewing accessories, customers should follow the accompanying instructions and safety information.'
    ),
    p(
      'Customers should stop using any product if they experience discomfort, irritation, dizziness or other adverse effects and seek appropriate professional advice where necessary. Parents, guardians, schools and institutions should supervise children where appropriate.'
    ),
    p(
      'Nothing in these Terms is intended to exclude liability for legally recognised product-safety obligations or other liability that cannot legally be excluded.'
    ),
  ]),
  sec('warranties', 'Warranties and consumer rights', [
    p(
      'Products and services are supplied subject to applicable statutory rights, warranties and consumer protections. Nothing in these Terms is intended to exclude, restrict or modify a right, guarantee, warranty, condition or remedy that cannot legally be excluded under applicable law.'
    ),
    p(
      'Where ODI Studio provides an express commercial warranty for a specific product or service, that warranty will apply in addition to mandatory statutory rights unless otherwise permitted by law.'
    ),
  ]),
  sec('liability', 'Limitation of liability', [
    p(
      'To the maximum extent permitted by applicable law, ODI Studio will not be liable for indirect, incidental, special or consequential losses arising from use of a product or service where such losses could not reasonably have been anticipated at the time of contracting.'
    ),
    p(
      'Nothing in these Terms limits or excludes liability to the extent such limitation or exclusion is prohibited by law, including liability that cannot legally be excluded. For paid creative services, any agreed limitation of liability should be interpreted together with the applicable project agreement.'
    ),
  ]),
  sec('force-majeure', 'Force majeure', [
    p(
      'ODI Studio will not be responsible for delay or failure caused by circumstances beyond its reasonable control, including natural disasters, fire, flood, epidemic, war, civil disturbance, government restrictions, strikes, infrastructure failures, internet or telecommunications failures, courier disruptions or other force majeure events. We will take reasonable steps to minimise the impact of such events.'
    ),
  ]),
  sec('complaints', 'Complaints and customer support', [
    p(
      'Customers are encouraged to contact ODI Studio first so that we can investigate and resolve concerns efficiently.'
    ),
    contact,
    p(
      'When contacting us, please provide your name, order/invoice number, contact details and a clear description of the issue. We will make reasonable efforts to acknowledge and address complaints within a reasonable time. Nothing in this process prevents a consumer from exercising any statutory right to approach a competent authority or forum.'
    ),
  ]),
  sec('changes', 'Changes to products and terms', [
    p('We may update these Terms from time to time to reflect changes in:'),
    ul([
      'products or services;',
      'technology;',
      'business practices;',
      'applicable law;',
      'regulatory requirements;',
      'security or privacy practices.',
    ]),
    p(
      'The updated version will be published on the website with an updated “Last Updated” date. Changes will not retrospectively remove rights that have already accrued under applicable law or an existing agreement.'
    ),
  ]),
  sec('governing-law', 'Governing law and jurisdiction', [
    p('These Terms are governed by the laws of India.'),
    p(
      'Subject to any mandatory consumer-protection jurisdiction or other jurisdiction that cannot lawfully be excluded, disputes shall be subject to the jurisdiction of the competent courts and authorities having jurisdiction over the applicable matter and/or the place of business of Oceaniek Technologies India.'
    ),
    p(
      'Nothing in this clause prevents a consumer from exercising a mandatory statutory right to approach a competent consumer authority or forum.'
    ),
  ]),
  sec('severability', 'Severability', [
    p(
      'If any provision of these Terms is found to be unlawful, invalid or unenforceable, that provision shall be modified or severed only to the extent necessary, and the remaining provisions shall continue to operate to the extent permitted by law.'
    ),
  ]),
  sec('entire-agreement', 'Entire agreement', [
    p(
      'These Terms, together with the applicable product description, quotation, invoice, order confirmation, purchase order, service agreement and other written terms expressly incorporated into an order, constitute the agreement applicable to the relevant transaction.'
    ),
    p(
      'If there is a conflict between these Terms and a specific written project agreement, the specific agreement will prevail to the extent of the conflict.'
    ),
  ]),
  sec('contact', 'Contact', [
    p('Questions about these Terms can be sent via the Contact page on this website, or using the details below.'),
    contact,
  ]),
];

const PRIVACY_SECTIONS: LegalSection[] = [
  sec('introduction', 'Introduction', [
    p('This Policy applies to information collected through:'),
    ul([
      'www.odi.studio;',
      'ODI Studio product purchases;',
      '3D Adventure Kit orders;',
      'offline orders;',
      'customer enquiries;',
      'stereo conversion and creative service engagements;',
      'email, telephone and other customer communications;',
      'forms and other interactions with ODI Studio.',
    ]),
  ]),
  sec('controller', 'Data controller / organisation', [
    p(
      'For the purposes of applicable data-protection law, the relevant organisation responsible for personal data processed by ODI Studio is:'
    ),
    contact,
  ]),
  sec('information-we-collect', 'Information we may collect', [
    p('Depending on how you interact with us, we may collect:'),
    h3('Identity information'),
    ul([
      'name;',
      'organisation/company name;',
      'billing information;',
      'GSTIN where supplied;',
      'information necessary for invoices and business records.',
    ]),
    h3('Contact information'),
    ul(['email address;', 'telephone/mobile number;', 'postal or delivery address.']),
    h3('Transaction information'),
    ul([
      'products or services purchased;',
      'order information;',
      'invoice information;',
      'payment status;',
      'transaction/reference information.',
    ]),
    p(
      'We generally do not need to store complete payment-card information where payment processing is handled by a third-party payment provider.'
    ),
    h3('Service / project information'),
    p('For stereo conversion or other services, we may process:'),
    ul([
      'project requirements;',
      'communication records;',
      'source files;',
      'output files;',
      'technical specifications;',
      'project-related information supplied by the customer.',
    ]),
    h3('Website and technical information'),
    p('Depending on our technology configuration, we may collect:'),
    ul([
      'IP address;',
      'browser type;',
      'device information;',
      'operating system;',
      'approximate location derived from technical information;',
      'pages viewed;',
      'referral information;',
      'website interaction data;',
      'cookies and similar technologies.',
    ]),
  ]),
  sec('how-we-use', 'How we use personal information', [
    p('We may process personal information to:'),
    ul([
      'provide products and services;',
      'process and fulfil orders;',
      'arrange delivery;',
      'issue invoices;',
      'process payments;',
      'provide customer support;',
      'respond to enquiries;',
      'manage stereo conversion projects;',
      'communicate about orders and services;',
      'maintain business and accounting records;',
      'prevent fraud and abuse;',
      'maintain website and information-security systems;',
      'improve products and services;',
      'comply with applicable legal, tax and regulatory obligations;',
      'enforce our agreements;',
      'resolve disputes;',
      'send promotional communications where permitted and, where required, with appropriate consent.',
    ]),
  ]),
  sec('legal-basis', 'Legal basis / permitted processing', [
    p(
      'We process personal information only for lawful purposes and in accordance with applicable data-protection requirements. Depending on the circumstances, processing may be based on:'
    ),
    ul([
      'your consent;',
      'steps necessary to provide a product or service requested by you;',
      'compliance with a legal obligation;',
      'legitimate and lawful business purposes where permitted;',
      'protection against fraud, misuse or security threats;',
      'establishment, exercise or defence of legal claims;',
      'other lawful grounds recognised under applicable law.',
    ]),
    p('Where consent is required, we will seek it in an appropriate manner.'),
  ]),
  sec('consent', 'Consent and withdrawal', [
    p(
      'Where processing is based on consent, you may withdraw consent subject to applicable law. Withdrawal of consent does not invalidate processing that occurred lawfully before withdrawal.'
    ),
    p(
      'Some information may need to continue to be retained where required for legal, tax, accounting, fraud-prevention, dispute-resolution or other lawful purposes.'
    ),
  ]),
  sec('marketing', 'Marketing communications', [
    p(
      'We may send service-related communications necessary to fulfil an order or provide a service. Where permitted, we may also send marketing communications about ODI Studio products, services, offers or announcements.'
    ),
    p(
      'You may opt out of promotional communications by using the unsubscribe mechanism where provided or by contacting us at hello@odi.studio. Opting out of marketing communications will not necessarily stop essential transactional or service communications.'
    ),
  ]),
  sec('cookies', 'Cookies and similar technologies', [
    p(
      'ODI Studio may use cookies, pixels, local storage and similar technologies to operate and improve the website. These technologies may be used for:'
    ),
    ul([
      'essential website functionality;',
      'security;',
      'remembering preferences;',
      'analytics;',
      'performance measurement;',
      'marketing, where applicable and permitted.',
    ]),
    p(
      'Where legally required, we will provide appropriate choices regarding non-essential cookies. You may also manage cookies through your browser settings, although disabling certain cookies may affect website functionality. See the Cookies Policy on this website for more detail.'
    ),
  ]),
  sec('payments', 'Payment information', [
    p(
      'Payments may be processed by third-party payment providers. Where a payment provider processes payment information, the provider may independently process certain information under its own privacy policy and terms.'
    ),
    p(
      'ODI Studio does not generally require customers to provide full card credentials directly to ODI Studio. Customers should never send passwords, card PINs, CVVs or similar sensitive authentication information to ODI Studio by email or telephone.'
    ),
  ]),
  sec('sharing', 'Sharing personal information', [
    p(
      'We may share information with service providers where reasonably necessary to operate our business, including:'
    ),
    ul([
      'payment processors;',
      'courier and logistics providers;',
      'website and hosting providers;',
      'cloud-storage providers;',
      'IT and cybersecurity providers;',
      'communication providers;',
      'accounting and professional advisers;',
      'analytics providers;',
      'legal advisers;',
      'government, tax, law-enforcement or regulatory authorities where legally required.',
    ]),
    p(
      'We do not sell personal information to third parties as a business practice. Service providers receiving personal information are expected to handle it appropriately and only for authorised purposes.'
    ),
  ]),
  sec('international', 'International data transfers', [
    p(
      'Some service providers may process information outside India. Where personal data is transferred or processed outside India, ODI Studio will take steps required by applicable law, including applicable restrictions, contractual safeguards or other lawful mechanisms.'
    ),
  ]),
  sec('security', 'Data security', [
    p(
      'We use reasonable technical and organisational measures designed to protect personal information against unauthorised access, misuse, loss, alteration or disclosure. Security measures may include:'
    ),
    ul([
      'access controls;',
      'authentication;',
      'secure communications;',
      'restricted employee access;',
      'service-provider controls;',
      'backups;',
      'monitoring and security procedures.',
    ]),
    p(
      'No internet transmission or electronic storage system can be guaranteed to be completely secure. Accordingly, while we take reasonable precautions, we cannot guarantee absolute security.'
    ),
  ]),
  sec('retention', 'Data retention', [
    p(
      'We retain personal information only for as long as reasonably necessary for the purposes for which it was collected, or for longer where required or permitted by law. Retention periods may depend on:'
    ),
    ul([
      'the nature of the information;',
      'the purpose of processing;',
      'legal and tax requirements;',
      'accounting requirements;',
      'contractual obligations;',
      'dispute-resolution needs;',
      'fraud-prevention and security requirements.',
    ]),
    p(
      'When information is no longer required, we may securely delete, anonymise or otherwise dispose of it as appropriate.'
    ),
  ]),
  sec('project-files', 'Customer project files', [
    p(
      'Where customers provide video, image, audio or other files for stereo conversion or creative services, ODI Studio may store and process those files for the purpose of performing the agreed services. Customers should not provide unnecessary personal information within project files.'
    ),
    p(
      'The customer is responsible for ensuring that they have the necessary rights and permissions to provide any third-party personal data or copyrighted material contained in project files. Where a project agreement specifies a particular file-retention or deletion period, that agreement will apply.'
    ),
  ]),
  sec('children', "Children's privacy", [
    p(
      'Our website and commercial services are not intended to knowingly collect unnecessary personal information directly from children. Where products are intended for children or educational use, purchases and interactions should be handled by a parent, guardian, teacher, institution or other responsible adult where appropriate.'
    ),
    p(
      'If you believe a child has provided personal information to us in circumstances where it should not have been collected, please contact us.'
    ),
  ]),
  sec('rights', 'Your data protection rights', [
    p(
      'Subject to applicable law, individuals may have rights relating to their personal information, which may include rights to:'
    ),
    ul([
      'obtain information about processing;',
      'access personal information;',
      'request correction of inaccurate information;',
      'request deletion where legally available;',
      'withdraw consent where processing is based on consent;',
      'exercise applicable grievance or complaint rights;',
      'exercise other rights provided under applicable data-protection law.',
    ]),
    p(
      'Certain rights may be subject to legal exceptions, verification requirements or other limitations. To exercise a right, contact hello@odi.studio or +91 9876907266. We may request reasonable information to verify your identity before acting on a request.'
    ),
  ]),
  sec('complaints', 'Data protection complaints', [
    p(
      'If you believe that your personal information has been handled improperly, please contact us first so that we can investigate and attempt to resolve the matter.'
    ),
    contact,
    p(
      'We will handle privacy complaints in accordance with applicable law and our internal procedures. Nothing in this Policy prevents you from exercising rights available under applicable law.'
    ),
  ]),
  sec('third-party-sites', 'Third-party websites', [
    p(
      'Our website may contain links to third-party websites, social-media platforms, payment providers or other external services. We are not responsible for the privacy practices of those third parties. You should review their respective privacy policies before providing information to them.'
    ),
  ]),
  sec('business-transfers', 'Business transfers', [
    p(
      'If Oceaniek Technologies India undergoes a merger, restructuring, sale of assets, acquisition or similar business transaction, personal information may be transferred as part of that transaction, subject to applicable law and appropriate safeguards.'
    ),
  ]),
  sec('changes', 'Changes to this Privacy Policy', [
    p('We may update this Privacy Policy from time to time to reflect:'),
    ul([
      'changes in our services;',
      'changes in technology;',
      'changes in privacy practices;',
      'changes in applicable laws or regulations;',
      'regulatory guidance.',
    ]),
    p('The latest version will be published on the website with its updated effective date.'),
  ]),
  sec('contact', 'Contact us', [
    p(
      'For questions, requests or complaints regarding this Privacy Policy, use the Contact page on this website or the details below.'
    ),
    contact,
  ]),
];

const COOKIES_SECTIONS: LegalSection[] = [
  sec('what-are-cookies', 'What are cookies?', [
    p(
      'Cookies are small text files stored on your device when you visit a website. Similar technologies include pixels and local storage. They help the site operate, remember preferences, keep sessions secure, and understand how pages are used.'
    ),
  ]),
  sec('how-we-use', 'How we use cookies', [
    p(
      'ODI Studio may use cookies, pixels, local storage and similar technologies to operate and improve the website. These technologies may be used for:'
    ),
    ul([
      'essential website functionality;',
      'security;',
      'remembering preferences;',
      'analytics;',
      'performance measurement;',
      'marketing, where applicable and permitted.',
    ]),
    p('Where legally required, we will provide appropriate choices regarding non-essential cookies.'),
  ]),
  sec('your-choices', 'Your choices', [
    p(
      'You may manage cookies through your browser settings, although disabling certain cookies may affect website functionality. You may also use private/incognito mode to limit persistent storage.'
    ),
    p(
      'For how we process personal information collected through these technologies, see the Privacy Policy on this website.'
    ),
  ]),
  sec('updates', 'Updates', [
    p(
      'We may update this Cookies Policy when our technology, privacy practices or legal requirements change. Check the effective and last-updated dates on this page for the current version.'
    ),
  ]),
  sec('contact', 'Contact', [
    p('Questions about cookies or this policy can be sent to hello@odi.studio.'),
    contact,
  ]),
];

export const SEED_PAGES: Omit<LegalPage, 'updatedAt'>[] = [
  {
    slug: 'terms',
    eyebrow: 'Legal',
    title: 'Terms &',
    titleAccent: 'Conditions',
    intro:
      'These Terms govern your access to and use of the ODI Studio website, purchase of ODI Studio products (including 3D Adventure Kits), and engagement of ODI Studio for stereo conversion and related creative services.',
    ...DATES,
    sections: TERMS_SECTIONS,
  },
  {
    slug: 'privacy',
    eyebrow: '',
    title: 'Privacy',
    titleAccent: 'Policy',
    intro:
      'ODI Studio, a brand of Oceaniek Technologies India, respects your privacy and is committed to handling personal information responsibly. This Privacy Policy explains what information we may collect, why we collect it, how we use it, how we protect it, when we may share it, and the choices and rights available to individuals under applicable law.',
    ...DATES,
    sections: PRIVACY_SECTIONS,
  },
  {
    slug: 'cookies',
    eyebrow: 'Legal',
    title: 'Cookies',
    titleAccent: 'Policy',
    intro:
      'This Cookies Policy explains how ODI Studio uses cookies, pixels, local storage and similar technologies when you visit our website, as described in our Privacy Policy.',
    ...DATES,
    sections: COOKIES_SECTIONS,
  },
];
