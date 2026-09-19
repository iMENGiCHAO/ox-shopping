/**
 * FAQ 兜底内容 —— 仅在数据库 `faqs` 表无已发布记录时使用
 * （正常情况由后台「FAQ 管理」维护，前台 /pages/faqs 实时读取）。
 *
 * 覆盖 shop.x.com `/pages/faqs` 实测的 10 个主题（问题清单对齐原站），
 * 答案按本店**真实政策**撰写：发货时效、预售规则、退货条件、
 * 支持的支付方式等均与 /policies/* 各页保持一致，避免两处说法冲突。
 *
 * 答案里的 `{supportEmail}` 会在渲染时替换为后台配置的客服邮箱
 * （SiteSetting.contactEmail）—— 兜底文案里不写死任何邮箱地址。
 */
export interface FaqDefault {
  question: string;
  answer: string;
  questionEn: string;
  answerEn: string;
}

export const FAQ_DEFAULTS: readonly FaqDefault[] = [
  {
    question: "我对店里的某件商品有疑问，可以联系谁？",
    answer:
      "商品、尺码、材质或批量采购等问题，请发送邮件至 {supportEmail}，或通过{contactForm}留言。我们的客服团队会在 1 个工作日内回复。",
    questionEn: "I have a general product question about an item in the store. Who can I contact?",
    answerEn:
      "For questions about a product, sizing, materials or wholesale, email us at {supportEmail} or use {contactForm}. Our team replies within one business day.",
  },
  {
    question: "下单后需要修改订单怎么办？",
    answer:
      "订单一旦提交便无法修改（预售商品在预售期内可申请取消）。请在下单前核对收货人、电话与地址——因填写错误导致的无法投递或丢失，我们无法承担责任。",
    questionEn: "What do I do if I need to make changes to my order?",
    answerEn:
      "Once an order is placed it cannot be modified (pre-order items may be cancelled while the pre-sale window is open). Please double-check the recipient, phone number and address before checking out — we cannot take responsibility for undeliverable or missing packages caused by incorrect details.",
  },
  {
    question: "订单多久处理？发货后我如何得知？",
    answer:
      "订单在工作日（周一至周五）处理。现货商品通常在付款后 3–4 个工作日内发出；预售商品按商品页标注的预售期结束后发出。发货时您会收到一封含运单号的邮件通知。",
    questionEn: "How soon will my order be processed and how will I know when it has been shipped?",
    answerEn:
      "Orders are processed on business days (Monday to Friday). In-stock items usually ship within 3–4 business days of payment; pre-order items ship once the pre-sale window shown on the product page ends. You will receive an email with the tracking number when your order leaves the warehouse.",
  },
  {
    question: "如何查询物流？",
    answer:
      "发货后您会收到一封含承运商与运单号的确认邮件。登录后进入「我的订单」，点击对应订单也可查看最新物流状态。",
    questionEn: "How can I track my order?",
    answerEn:
      "When your package ships you will receive a confirmation email containing the carrier and tracking number. You can also sign in, open “My Orders” and click the order to see its current delivery status.",
  },
  {
    question: "包裹出问题了 / 一直没收到，怎么办？",
    answer:
      "请发送邮件至 {supportEmail}，并附上订单号、问题描述以及（如有）包裹照片。我们会在 1 个工作日内为您核实并给出解决方案。",
    questionEn: "There is a problem with my shipment / my order never arrived — what should I do?",
    answerEn:
      "Email {supportEmail} with your order number, a description of the problem and, if possible, photos of the package. We will investigate and come back to you within one business day.",
  },
  {
    question: "支持哪些支付方式？",
    answer:
      "我们支持主流信用卡与借记卡在线支付。可用的支付方式以结账页展示为准，并可能因收货国家或地区而不同。",
    questionEn: "What types of payment do you accept?",
    answerEn:
      "We accept all major credit and debit cards. The payment methods available to you are shown at checkout and may vary by shipping country or region.",
  },
  {
    question: "可以换货吗？",
    answer:
      "我们不直接提供换货服务。如果您需要不同的尺码或款式，请先按退货流程退回原商品，再重新下单。",
    questionEn: "Do you accept exchanges?",
    answerEn:
      "We are unable to accept direct exchanges. If you need a different size or style, please return the original item and place a new order.",
  },
  {
    question: "从第三方渠道购买的商品可以退吗？",
    answer:
      "不可以。通过第三方卖家或平台购买的商品需直接联系该卖家退货，我们无法受理非本店渠道售出商品的退货。",
    questionEn: "Can I return a product purchased from a third party?",
    answerEn:
      "No. Items purchased from a third-party seller or marketplace must be returned directly to that seller; we cannot accept returns of goods purchased outside our store.",
  },
  {
    question: "我的订单符合退货条件吗？",
    answer:
      "商品需未经使用、未经洗涤，吊牌与包装完好，并在签收后 14 天内提出申请。定制商品、内衣与贴身用品，以及已拆封的个护类商品不支持退货。",
    questionEn: "Am I eligible for a return?",
    answerEn:
      "Items must be unworn, unwashed and in their original packaging with tags attached, and the request must be made within 14 days of delivery. Personalised items, underwear and intimate apparel, and opened personal-care products are not eligible.",
  },
  {
    question: "退货流程是怎样的？",
    answer:
      "请在签收后 14 天内发送邮件至 {supportEmail}，附上订单号与退货原因。审核通过后我们会发送退货地址与操作说明；请使用可查询的物流方式寄回，退款将在我们收到并检验商品后 5–10 个工作日内原路退回。",
    questionEn: "How do I return a product?",
    answerEn:
      "Email {supportEmail} within 14 days of delivery with your order number and the reason for the return. Once approved we will send you the return address and instructions. Please ship the item back with a trackable service — refunds are issued to the original payment method within 5–10 business days of us receiving and inspecting the item.",
  },
] as const;
