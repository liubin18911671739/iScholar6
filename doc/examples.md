# 使用示例

> 本文档提供 7 大 AI 智能体的完整输入/输出示例，帮助您快速上手 iScholar。
>
> 🏗️ **目标架构**：智能体由后端 LangGraph 运行时执行（模型 `deepseek-v4-flash`），运行事件经 SSE 实时推送，结构化产物经 `AgentHarness` 幂等写入 PostgreSQL。输入/输出**结构**与本文档示例一致；下方 JSON 是各智能体的结构化输出契约。
>
> 🎨 **v6.0 模块页采用 3 列独立滚动布局**：顶栏 + 8 步工作流进度条固定在上方，左/中/右三列各自独立滚动。UI 组件包括：标签芯片（多选切换）、分段控件（研究类型选择）、可点击状态徽章（文献筛选）、SVG 环形进度条（Fit-score）和交互式 checklist（投稿材料）。
>
> 详见 [使用指南](./usage.md) 了解每个模块的完整 UI 说明；架构与数据流见[系统架构](./architecture.md)。

> ⚠️ 重构进行中：部分智能体的后端图仍在迁移（见 `IMPLEMENTATION_PLAN.md` Stage 2/4），迁移期输出由旧直连 DeepSeek 路径产生，结构与示例一致。

---

## 示例 1：选题探索 · TopicScout

### 输入

| 字段 | 值 |
|------|-----|
| 学科领域 | 教育技术学 |
| 关键词 | AI自适应学习, 个性化教育, 学习分析 |
| 目标期刊 | Computers & Education |

### 输出（实时生成）

#### 3 个候选选题

| # | 选题 | 新颖性 | 价值 | 可行性 | 理由 |
|---|------|--------|------|--------|------|
| 1 | 基于多模态学习行为数据的个性化学习路径动态优化研究 | 8.5 | 9.0 | 7.5 | 整合眼动追踪与交互日志数据，利用深度强化学习实时调整学习路径 |
| 2 | 大语言模型驱动的认知诊断与自适应反馈机制研究 | 9.0 | 8.5 | 7.0 | 利用LLM对学习者知识状态进行动态建模，生成个性化解释性反馈 |
| 3 | 生成式AI辅助的协作学习小组智能分组策略研究 | 7.5 | 8.0 | 8.5 | 基于学习者画像和社交网络分析，利用GPT生成最优协作小组配置 |

#### 结构化输出（JSON）

```json
{
  "topics": [
    {
      "title": "基于多模态学习行为数据的个性化学习路径动态优化研究",
      "gap": "现有研究多依赖单一数据源（如点击流），忽视了眼动、面部表情等多模态信号的协同预测价值",
      "novelty": 8.5,
      "value": 9.0,
      "feasibility": 7.5,
      "rationale": "整合眼动追踪与交互日志数据，利用深度强化学习实时调整学习路径"
    },
    {
      "title": "大语言模型驱动的认知诊断与自适应反馈机制研究",
      "gap": "传统认知诊断模型（如DINA）无法捕捉开放式问题的深层理解，LLM为细粒度诊断提供了新可能",
      "novelty": 9.0,
      "value": 8.5,
      "feasibility": 7.0,
      "rationale": "利用LLM对学习者知识状态进行动态建模，生成个性化解释性反馈"
    },
    {
      "title": "生成式AI辅助的协作学习小组智能分组策略研究",
      "gap": "现有分组策略多基于静态特征，未能考虑学习过程中小组动态的实时变化",
      "novelty": 7.5,
      "value": 8.0,
      "feasibility": 8.5,
      "rationale": "基于学习者画像和社交网络分析，利用GPT生成最优协作小组配置"
    }
  ]
}
```

---

## 示例 2：文献综述 · LitReview

### 输入

| 字段 | 值 |
|------|-----|
| 检索词 | AI in personalized learning higher education |
| 年份范围 | 2020 — 2025 |
| 最大结果数 | 30 |

### 输出（实时生成）

#### 论文列表（部分）

| # | 标题 | 作者 | 年份 | 期刊/会议 | 方法 | 发现 |
|---|------|------|------|-----------|------|------|
| 1 | Adaptive Learning Path Recommendation Based on Graph Neural Networks | Chen, L. et al. | 2023 | Computers & Education | 图神经网络 + 实验研究 (n=256) | GNN路径推荐相比基线提升23%学习成效 |
| 2 | Large Language Models for Educational Feedback: A Systematic Review | Kumar, A. et al. | 2024 | Review of Educational Research | 系统综述 (n=89篇) | LLM反馈可解释性优于传统AES系统，但存在幻觉风险 |
| 3 | Multimodal Learning Analytics: Predicting Academic Performance | Martinez, C. et al. | 2022 | LAK Conference | 机器学习 + 纵向跟踪 (n=342) | 眼动+点击流融合模型AUC=0.87，优于单模态 |

#### 研究空白

1. 缺乏跨平台学习行为数据的统一表征标准
2. LLM在教育场景中的公平性与偏见问题尚待系统性研究
3. 多模态数据融合的实时处理架构研究较少

#### 结构化输出（JSON）

```json
{
  "papers": [
    {
      "title": "Adaptive Learning Path Recommendation Based on Graph Neural Networks",
      "authors": ["Chen, L.", "Wang, X.", "Zhao, Y."],
      "year": 2023,
      "venue": "Computers & Education",
      "method": "Graph Neural Networks",
      "findings": "GNN路径推荐相比基线提升23%学习成效",
      "doi": "10.1016/j.compedu.2023.104891"
    }
  ],
  "themes": ["个性化学习路径", "AI辅助反馈", "学习分析"],
  "gaps": ["跨平台数据统一表征", "LLM公平性研究", "实时多模态融合架构"]
}
```

---

## 示例 3：研究设计 · ResearchDesigner

### 输入

| 字段 | 值 |
|------|-----|
| 研究问题 | 自适应学习系统如何影响不同先验知识水平学生的学业成绩与学习投入度？ |
| 方法提示 | 混合方法：准实验 + 访谈 |

### 输出（实时生成）

#### 假设

- **H1**：使用自适应学习系统的学生（实验组）学业成绩显著高于传统教学组（对照组）
- **H2**：低先验知识学生在自适应系统中的获益程度高于高先验知识学生
- **H3**：自适应系统的个性化反馈显著提升学习投入度（行为 + 情感维度）

#### 变量

| 类型 | 变量 | 测量方式 |
|------|------|---------|
| 自变量（IV） | 教学模式（自适应 vs. 传统） | 分组赋值 |
| 因变量（DV） | 学业成绩、学习投入度 | 后测成绩、NSSE问卷 |
| 调节变量 | 先验知识水平（高/低） | 前测成绩分组 |
| 中介变量 | 个性化反馈感知 | 5点Likert量表 |

#### 结构化输出（JSON）

```json
{
  "feasibility": {
    "score": 7.2,
    "factors": [
      { "name": "被试可获取性", "score": 8, "note": "两所合作高校，预计招募200人" },
      { "name": "技术准备度", "score": 7, "note": "已有自适应学习平台原型需二次开发" },
      { "name": "时间可行性", "score": 6, "note": "完整干预需12周，含前测/后测" },
      { "name": "伦理审批", "score": 8, "note": "已获IRB初步许可" }
    ]
  },
  "hypotheses": [
    "H1：使用自适应学习系统的学生学业成绩显著高于传统教学组",
    "H2：低先验知识学生在自适应系统中的获益程度高于高先验知识学生",
    "H3：自适应系统的个性化反馈显著提升学习投入度"
  ],
  "variables": {
    "independent": ["教学模式（自适应 vs. 传统）"],
    "dependent": ["学业成绩（后测）", "学习投入度（NSSE）"],
    "mediators": ["个性化反馈感知"],
    "moderators": ["先验知识水平（高/低）"]
  }
}
```

---

## 示例 4：数据分析 · DataPilot

### 输入

| 字段 | 值 |
|------|-----|
| 数据来源描述 | 3所大学的在线学习平台日志数据，CSV格式，含15,000条记录。包含字段：student_id、course_id、login_freq、video_watch_time(min)、quiz_score、forum_posts、final_grade |
| 收集方法 | 学习管理系统（LMS）后台导出，2024年秋季学期 |

### 输出（实时生成）

#### 分析建议

1. **数据清洗**：剔除登录频率 < 5 的非活跃用户记录（约3%）
2. **特征工程**：创建综合指标 `engagement_score = (login_freq * 0.3 + watch_time * 0.4 + forum_posts * 0.3)`
3. **统计检验**：采用多元线性回归，以 `final_grade` 为因变量

#### 生成的分析脚本（Python）

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, mean_squared_error

# 加载数据
df = pd.read_csv('learning_analytics.csv')

# 数据清洗
df = df[df['login_freq'] >= 5]
df = df.dropna()

# 特征工程
df['engagement_score'] = (
    df['login_freq'] * 0.3 +
    df['video_watch_time'] * 0.4 +
    df['forum_posts'] * 0.3
)

# 回归分析
X = df[['login_freq', 'video_watch_time', 'quiz_score', 'forum_posts', 'engagement_score']]
y = df['final_grade']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = LinearRegression()
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

print(f'R² Score: {r2_score(y_test, y_pred):.3f}')
print(f'RMSE: {np.sqrt(mean_squared_error(y_test, y_pred)):.2f}')

# 特征重要性
for feat, coef in zip(X.columns, model.coef_):
    print(f'{feat}: {coef:.3f}')
```

#### 结构化输出（JSON）

```json
{
  "scripts": [
    {
      "language": "Python",
      "filename": "regression_analysis.py",
      "code": "import pandas as pd\nimport numpy as np\n..."
    },
    {
      "language": "R",
      "filename": "visualization.R",
      "code": "library(ggplot2)\n..."
    }
  ],
  "recommendations": [
    "建议对 login_freq 进行对数变换以改善正态性",
    "考虑加入课程难度作为控制变量",
    "使用SHAP值解释模型预测"
  ],
  "analysisPlan": ["描述性统计", "相关性矩阵", "多元线性回归", "残差诊断", "稳健性检验"]
}
```

---

## 示例 5：论文撰写 · IMRaDWriter

### 输入

| 字段 | 值 |
|------|-----|
| 章节 | 引言（Introduction） |
| 引用格式 | APA 7th |

### 输出（实时生成）

#### 生成的引言（富文本编辑器中可编辑）

近年来，人工智能（AI）技术在教育领域中的应用呈现指数级增长。特别是自2022年以来，以大语言模型（LLMs）为代表的生成式AI技术，为个性化学习带来了前所未有的机遇与挑战（Chen et al., 2023; Kumar et al., 2024）。

尽管自适应学习系统已有多年的研究积累，但现有系统大多基于预设的规则引擎或简单的协同过滤算法，难以捕捉学习者实时变化的认知状态（Martinez, 2022）。大语言模型的出现为解决这一问题提供了新的技术路径——它们不仅能够理解和生成自然语言，还能对学习者的知识建构过程进行细粒度的诊断与反馈（Williams & Park, 2024）。

然而，现有研究仍存在以下**研究缺口**：（1）缺乏将LLM与多模态学习数据（眼动、面部表情、交互日志）深度融合的系统架构；（2）LLM生成的教育反馈在准确性与可解释性之间的平衡尚未得到充分验证；（3）针对不同先验知识水平学习者的自适应策略缺乏差异化设计。

基于上述分析，本研究旨在探索**基于大语言模型的多模态自适应学习系统**的设计、开发与效果验证。具体研究问题包括：（1）该系统如何整合多模态数据生成个性化学习路径？（2）不同先验知识水平的学生在使用该系统后的学习成效差异如何？

#### 结构化输出（JSON）

```json
{
  "references": [
    {
      "key": "chen2023",
      "authors": "Chen, L., Wang, X., & Zhao, Y.",
      "title": "Adaptive Learning Path Recommendation Based on Graph Neural Networks",
      "year": 2023,
      "venue": "Computers & Education",
      "doi": "10.1016/j.compedu.2023.104891"
    }
  ],
  "section": "introduction",
  "wordCount": 458
}
```

---

## 示例 6：投稿匹配 · SubmitMatch

### 输入

| 字段 | 值 |
|------|-----|
| 摘要 | 大语言模型正在重塑个性化学习的可能性边界。本研究设计并实现了一种基于LLM的多模态自适应学习系统，整合了学习行为日志、眼动追踪和面部表情分析三种数据源。通过一项为期12周的准实验研究（n=186），我们验证了该系统在提升学习成效（效应量d=0.72, p<0.001）和学习投入度方面的显著效果。本研究为下一代智能学习系统的设计提供了理论和实践指导。 |
| 关键词 | 大语言模型, 自适应学习, 多模态学习分析, 个性化教育 |
| 开放获取偏好 | 是 |

### 输出（实时生成）

#### 期刊推荐

| # | 期刊名称 | 匹配度 | 影响因子 | 审稿周期 | OA | 推荐理由 |
|---|---------|--------|---------|---------|-----|---------|
| 1 | Computers & Education | 94% | 12.5 | 8-12周 | ✅ | 期刊重点收录AI教育应用研究，与本文主题高度吻合 |
| 2 | British Journal of Educational Technology | 88% | 7.5 | 6-10周 | ✅ | 近两年发表多篇LLM+学习分析相关论文 |
| 3 | International Journal of Artificial Intelligence in Education | 85% | 4.2 | 10-16周 | ✅ | 专注AI教育应用，受众精准但审稿周期较长 |

#### 投稿清单

- [ ] 稿件（Manuscript）— 已包含摘要、全文、参考文献、图表
- [ ] Cover Letter — 已生成，简述研究创新点与期刊匹配理由
- [ ] 图表文件（Figures）— 3张示意图 + 2张结果图表
- [ ] 补充材料（Supplementary）— 实验问卷、访谈提纲
- [ ] 作者声明（Author Statement）— 作者贡献、利益冲突声明

#### 结构化输出（JSON）

```json
{
  "journals": [
    {
      "name": "Computers & Education",
      "fitScore": 94,
      "impactFactor": 12.5,
      "reviewTimeline": "8-12 weeks",
      "openAccess": true,
      "rationale": "期刊重点收录AI教育应用研究，与本文主题高度吻合"
    }
  ],
  "checklist": [
    "稿件（Manuscript）",
    "Cover Letter",
    "图表文件（Figures）",
    "补充材料（Supplementary）",
    "作者声明（Author Statement）"
  ]
}
```

---

## 示例 7：审稿回复 · RebuttalShow

### 输入

| 字段 | 值 |
|------|-----|
| 审稿人意见 | 粘贴或上传PDF后自动提取 |

#### 示例审稿意见

> Reviewer 1, Comment 3: The authors claim that the LLM-based system outperforms traditional methods, but the experimental design only includes a pre-test and post-test without a control group for comparison. This severely limits the validity of the conclusions.

> Reviewer 1, Comment 5: The sample size (n=186) is relatively small for a study employing machine learning techniques. The authors should discuss the statistical power and potential overfitting issues.

### 输出（实时生成）

#### 逐条回复

| # | 审稿人意见 | 作者回复 | 修改位置 |
|---|-----------|---------|---------|
| 1.3 | 实验设计仅包含前测和后测，缺少对照组，严重限制了结论的有效性。 | 感谢审稿人的宝贵意见。我们完全同意对照组的必要性。在原设计中，我们采用了**准实验设计**，将两个平行班级分别设为实验组（LLM系统）和对照组（传统在线学习平台）。我们在修改稿中更清晰地阐述了这一设计：**Methods 2.4节**新增了对照组匹配过程的详细描述（班级规模、前测成绩、教师资质等协变量的平衡性检验）。同时，我们补充了**独立样本t检验**的结果（t(184)=4.27, p<0.001），明确对比了两组间的效应量差异。 | Methods 2.4, Table 1, Results 3.1 |
| 1.5 | n=186相对偏小，可能存在过拟合风险。 | 感谢审稿人对统计效力的关切。我们进行了以下补充分析：（1）**事后统计效力分析**显示，当前样本量在α=0.05、效应量d=0.72的条件下，统计效力为0.94（>0.80标准阈值）；（2）我们添加了**5折交叉验证**结果，模型表现稳定（R²=0.71±0.03），排除过拟合风险；（3）在**Discussion 5.3节**新增了样本量局限性的坦诚讨论，建议未来研究在本校其他校区（n≈500）进行外部验证。 | Discussion 5.3, Supplementary Table S2 |

#### 结构化输出（JSON）

```json
{
  "responses": [
    {
      "commentNumber": 3,
      "comment": "The authors claim that the LLM-based system outperforms traditional methods, but the experimental design only includes a pre-test and post-test without a control group for comparison.",
      "response": "感谢审稿人的宝贵意见。我们完全同意对照组的必要性。在原设计中，我们采用了准实验设计，将两个平行班级分别设为实验组和对照组。",
      "changeLocation": "Methods 2.4, Table 1, Results 3.1",
      "evidence": "补充了独立样本t检验结果：t(184)=4.27, p<0.001"
    },
    {
      "commentNumber": 5,
      "comment": "The sample size (n=186) is relatively small for a study employing machine learning techniques.",
      "response": "感谢审稿人对统计效力的关切。事後统计效力分析显示当前样本量在α=0.05、效应量d=0.72条件下，统计效力为0.94。",
      "changeLocation": "Discussion 5.3, Supplementary Table S2",
      "evidence": "5折交叉验证结果R²=0.71±0.03，排除过拟合风险"
    }
  ]
}
```

---

## 完整工作流示例（端到端）

以下演示从选题到投稿的完整 LLM+教育研究流程，展示 8 步工作流进度条中每个阶段的操作：

```text
Step 1·选题 (Cyan)    TopicScout   →  标签芯片选领域 → 3个候选选题卡片，评分 9.0/8.5/7.0
Step 2·综述 (Sky)     LitReview    →  数据库标签选源 → 检索30篇论文，状态徽章筛选，识别3个空白
Step 3·设计 (Violet)  Design       →  PICO 2×2 网格 + 分段控件选 RCT → 3个假设，可行性 7.2
Step 4·数据 (Teal)    DataPilot    →  3张指标卡片 → SVGActionForest Plot + Box Plot
Step 5·分析 (Teal)    (同上 data)   →  假设检验表，显著性徽章（显著/不显著）
Step 6·写作 (Blue)    Write        →  IMRaD 4卡片选择章节 → RichEditor，引用管理器，导出 PDF
Step 7·投稿 (Emerald) SubmitMatch  →  Fit-score SVG 环形进度条 92% → checklist 勾选 3/5
Step 8·返修 (Fuchsia) Rebuttal     →  逐条回复表（修改/建议/澄清徽章）→ 导出 HTML 回复信
```

---

> **说明**：以上输出为 AI 实时生成，实际结果会因具体输入和模型响应而有所不同。示例中的结构化 JSON 是各智能体的输出契约，作为运行产物（artifacts）幂等写入 PostgreSQL，可随时在「已保存内容」面板查看与审计。各模块的具体 UI 交互说明见 [使用指南](./usage.md)。